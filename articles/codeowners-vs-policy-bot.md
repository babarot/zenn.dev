---
title: "CODEOWNERSとpalantir/policy-botを比較する"
emoji: "🛂"
type: "tech"
topics: ["github", "policybot", "codeowners", "codereview"]
published: true
---
GitHubでPull Requestの承認フローを制御する仕組みといえば[CODEOWNERS](https://docs.github.com/ja/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)が定番だと思う。似たような別の仕組みとして[palantir/policy-bot](https://github.com/palantir/policy-bot)というOSSがあり、これはGitHub Appとして実装されている。[mercari/policy-bot](https://github.com/mercari/policy-bot)というforkもあることも知った。気になったのでCODEOWNERSと合わせて3つを比較してみる。

先に結論っぽいことを書いておくと、承認ポリシーの表現力という軸で比べると policy-bot の方が明らかに強い。CODEOWNERSでできることはpolicy-botでもだいたい書けるが、その逆は成り立たない。ただ CODEOWNERS には「GitHub ネイティブで動く」「ファイル1枚で済むシンプルさ」という別軸の強みがあって、機能の豊富さだけでは選べないのも事実だなと調査を通じて思った。どちらを使うかはその辺りのトレードオフで判断することになる。

## CODEOWNERS

CODEOWNERSはGitHub純正の機能で、リポジトリの`.github/CODEOWNERS`にファイルパスとapproverを書く。これはユーザネームでもチーム名でもいい。Repository Ruleset / Branch protectionの「Require review from Code Owners」をオンにすれば、該当オーナーのapprovalなしにはmergeできなくなる。

```
*                   @org/default-team
*.go                @org/backend-team
/frontend/          @org/frontend-team
/frontend/auth/     @security-team @org/frontend-team
```

設計はシンプルで、ファイル1枚で完結する。GitHub UIに「このファイルの担当は誰か」が表示され、PR作成時に担当者が自動でreviewerにassignされる。GitHub Appを立てる必要もサーバを運用する必要もない。導入コストはほぼゼロ。

「特定のディレクトリの変更は特定のチームがレビューする」という基本的な責任分担をしたいだけなら、CODEOWNERSで十分に機能する。ただし、とても大きなモノレポなど、CODEOWNERSの設計を超えたユースケースだとCODEOWNERSの運用（ファイル自体のメンテも）厳しくなってくる。
### パスが重なったら最後の行だけが有効

CODEOWNERSはルールを累積しない。上の例で`/frontend/auth/foo.go`を変更すると、`*.go`と`/frontend/`は無視されて`@security-team @org/frontend-team`だけが有効になる。backend-teamも絡めたければ並記するしかないが、組み合わせが増えると管理が大変になる。

### ファイルパス条件しか扱えない

- dependabotが作ったlock file更新PRはbuildさえ通れば自動承認したい
- `BREAKING CHANGE:`で始まるtitleのPRには別teamの承認も求めたい
- staging環境の変更はsmoke testが通れば自動承認したい

こういった要件はCODEOWNERSでは表現できない。書けるのは「このパスが変わったらこの人」のような表現に限られる。

### path別に承認数を変えられない

~~Rulesets や branch protectionの「N approvals required」はリポジトリ全体の設定。「security配下は2人、それ以外は1人」のような制御はできない。~~

:::message
**2026/04/17 追記**: コメントで指摘をいただいた。CODEOWNERS 単体ではできないが、Branch Rulesets の「Required review by specific teams」を使えば file pattern ごとに reviewer team と必要な approval 数を指定できる。たとえば `.github/workflows/*.yaml` に対して security team と sre team それぞれ1 approval（計2 approve）を要求する、といった設定が可能。CODEOWNERS ではなく Rulesets 側の機能だが、GitHub ネイティブで path 別の承認数制御ができる。
:::

### AND条件を強制できない

~~`/frontend/auth/  @security-team @frontend-team`と並記しても、実体としてはどちらか一人が承認すればOK（暗黙のOR）。両者必須にしたい場合、CODEOWNERSでは表現できない。~~

:::message
**2026/04/17 追記**: こちらも同様に、Branch Rulesets「Required review by specific teams」で同じ file pattern に複数チームを割り当てれば、AND条件（両チームそれぞれの承認が必要）を強制できる。加えて Organization Rulesets を使えば org level でルールを強制でき、CODEOWNERS にはないスケーラビリティがある。
:::

### 自動承認がない

`*.md`しか変わらないPRを自動approveにできれば開発者体験は上がるが、CODEOWNERSはそういう発想の機能ではない。

### bot / 定型PRの特別扱いができない

dependabot、renovate、tagpr、release-pleaseといったbot PRが増えてくると、人間のPRと同じ承認フローで回すのは現実的でなくなる。

…

こうしたことをやりたくなってきたらpolicy-botが視野に入る。

## policy-bot

[`policy-bot`](https://github.com/palantir/policy-bot)はGitHub Appとして動作する承認ポリシーエンジン。

- リポジトリにYAMLでポリシーを書く（デフォルトは`.policy.yml`）
- PRのHEADコミットに承認状況をstatus checkとして投稿する
- Repository ruleset / branch protectionでそのstatus checkを required にすれば、ポリシーを満たさない限りmergeできない
- PR詳細を表示するWeb UI付き

CODEOWNERSと違い、「どういう条件のPRにどういう承認ルールを適用するか」を柔軟に書ける。以下のポリシーの設定例を見たら雰囲気を掴めると思う。

```yaml
# 実際のポリシー本体
policy:
  approval:
    - or:
      - the devtools team has approved
      - only staging files have changed
  disapproval:
    requires:
      organizations:
        - "palantir"

# ルール定義
approval_rules:
  - name: the devtools team has approved
    requires:
      count: 1
      teams:
        - "palantir/devtools"
  - name: only staging files have changed
    if:
      only_changed_files:
        paths:
          - "^staging/.*$"
    requires:
      count: 0   # 条件を満たせば自動承認
```

この例だと、「devtoolsチームが承認した」または「staging配下のファイルしか変わっていない」のどちらかを満たせば承認される。staging変更のみなら自動承認、それ以外ならdevtoolsの承認が要る、ということを意味する。

### Ruleの4状態

policy-botには以下の4つの定義がある:

- **Policy**: 最上位の定義。`approval`ブロックにルールを`and`/`or`/単独で並べる
- **Rule**: 承認条件の単位。`if`（predicate）と`requires`（requirement）を持つ
- **Predicate**: ルールがいつ有効になるかの条件（PR title、変更ファイル、authorなど）
- **Requirement**: 承認として何が必要か（N人のapprove、特定team、追加status等）

ルールは評価後に4つの状態を取る。

| 状態 | 意味 | and/or での扱い |
|---|---|---|
| `approved` | predicate / requirement すべて true | true |
| `pending` | predicate は true だが requirement が未達 | false |
| `skipped` | predicate が false（ルール無効） | 無視（存在しないものとして扱う） |
| `error` | 評価エラー | false |

`skipped`の扱いがいい。`if`が false のルールは存在しないものとして扱われるので、「条件を満たしたときだけ追加の承認を求める」ルールをいくつも並べても、普段は全部`skipped`で透過的に振る舞う。

policy-botで書ける predicate と options は[READMEに詳細に書かれている](https://github.com/palantir/policy-bot#policyyml-specification)ので見てみると良いと思う。いくつかのユースケースでpolicy-botのポリシーを書いてみる。

### bot PR を CI 通過だけで自動承認する

`dependabot` / `renovate` / `tagpr` / `release-please` といった bot が日に何件もPRを作るリポジトリだと、それを人間が1つずつapproveするのは厳しい。かといってRulesetやbranch protectionの "Require review" を外して GitHub 標準の auto-merge を全部許可するのもできない。lock file に意図しない変更が混ざっていないか、CIで検出したいバグが出ていないか、最低限の防波堤は残したい、みたいなケース。

```yaml
approval_rules:
  - name: dependabot lockfile only
    if:
      has_author_in:
        users: ["dependabot[bot]"]
      only_changed_files:
        globs: ["package-lock.json", "yarn.lock", "go.sum"]
      has_status:
        conclusions: ["success"]
        statuses: ["build", "test"]
    requires:
      count: 0
```

肝となるのは `count: 0` と `has_status` の組み合わせ。「人間の承認は不要、ただし build と test の status check が成功していること」という条件で自動承認になる。GitHubのauto-mergeと組み合わせれば、CIが通った時点で勝手にmergeされる。

同じ発想で renovate を「patch/minor は自動、major は人間レビュー」に切り分けることもできる。renovateはPR titleに`chore(deps): update foo to v2`のようにバージョン遷移が入るので、`title` predicate で分岐できる。

```yaml
  - name: renovate patch minor auto-approve
    if:
      has_author_in:
        users: ["renovate[bot]"]
      title:
        not_matches: ["^.*to v[0-9]+ "]  # majorは除外
      has_status:
        statuses: ["build"]
    requires:
      count: 0
```

あるいはtagprの release PR のように「コミットは人間のものだがPR作成はbot」のようなケースも、`has_author_in` + `has_contributor_in` の組み合わせで的確に拾える。承認運用をスキップしていい定型PRを条件で厳密に切り出せる。

### モノレポでパス別の承認数を制御する

複数サービスを1つのリポジトリに載せるモノレポだと、「このサービスの変更はそのサービス担当の1人で十分」「複数サービスをまたいだ変更はmaintainersの2人」のような path 依存の承認要件を書きたくなる。CODEOWNERSだと「承認できる人」は指定できるが「承認者の人数」は ruleset / branch protection のリポジトリ全体設定しかない。

policy-bot は `only_changed_files` で「対象サービス配下だけを触ったPR」を識別できるので、サービスごとに別ルールを生やせる。

```yaml
policy:
  approval:
    - or:
      - service auth self-review
      - service billing self-review
      - service catalog self-review
      - default cross-service

approval_rules:
  - name: service auth self-review
    if:
      only_changed_files:
        globs: ["services/auth/**"]
    requires:
      count: 1
      teams: ["org/auth-team"]

  - name: service billing self-review
    if:
      only_changed_files:
        globs: ["services/billing/**"]
    requires:
      count: 1
      teams: ["org/billing-team"]

  # catalog も同様に...

  - name: default cross-service
    requires:
      count: 2
      teams: ["org/maintainers"]
```

1サービス完結のPRなら所属チームの1人のapproveで通る。複数サービスにまたがるPRはどの `self-review` ルールもskippedになるので、`or` 全体がfalseとなりfallbackの `default cross-service` に落ちる。Ruleの4状態の `skipped` がうまく機能する例だ。

`changed_files` ではなく `only_changed_files` を使っているのがポイントで、「対象サービスのファイル ***も*** 含むPR」ではなく「対象サービスのファイル ***しか*** 含まないPR」を条件にしている。これで「auth/ と billing/ を両方触るPRが auth-team 1人で通ってしまう」事故を防げる。

### すでに付いたApproveをリセットする

`invalidate_on_push: true`（pushしたら既存のapproveをリセット）を有効にする運用は「stale なapproveを残さない」という観点で採用されることが多い。~~ただしruleset / branch protectionで同様の設定（Dismiss stale reviews）を有効にすると、本当にすべてのpushでリセットされる。主ブランチをmergeしてconflict解消しただけ、bulldozer が自動でupdateしただけ、renovateが自動rebaseしただけ、のようなケースでも reapprove が必要になり、地味にレビュワーに負担がかかる。~~

:::message
**2026/04/17 追記**: コメントで指摘をいただいた。Rulesets の Dismiss stale reviews を有効にしても、GitHub UI の「Update branch」ボタンによる trivial merge では approve は dismiss されない。`Require approval of the most recent reviewable push` が有効でも approver が update branch して merge できる。「すべてのpushでリセットされる」は不正確だった。一方で conflict 解消のように実質的にコードを変更する push ではリセットされるが、これはセキュリティ的に妥当な挙動といえる。
:::

policy-bot には「何を push として扱わないか」の細かいフラグがある。

```yaml
options:
  invalidate_on_push: true
  ignore_update_merges: true           # "Update branch" ボタンが作るmerge commit
  ignore_commits_by:
    users:
      - "bulldozer[bot]"
      - "renovate[bot]"
      - "github-actions[bot]"
```

- `ignore_update_merges`: GitHub UIの "Update branch" ボタンで作られる merge commit（親が2つ、`committedViaWeb: true`、片方が target branch）を承認リセットの対象外にする
- `ignore_commits_by`: 指定したユーザーの commit を "寄与" とみなさないようにする。承認リセットも発火しないし、`has_contributor_in` の判定にも含まれない

この2つを併用することで「コード本体の変更でのみ approve がリセットされる」運用が実現する。「approveしたのに main を merge したらリセットされた」問題が消えるので、レビュワーのストレスが減る。

なお`ignore_commits_by`の指定は信頼の委譲でもあって、そのユーザー（bot）のcommitは検証をスキップする扱いになる。bot が compromise されるとその間に任意コードを混ぜられるので、信頼できるbotに限定すべき、というのは当然の注意点になる。

### リポジトリの構成ファイル削除に別ラインの承認を要求する

`.github/workflows/*.yaml` の削除は supply chain security の観点でセンシティブだ。security scanner のワークフローを黙って消す、release processをskipさせる、といった攻撃経路になりうる。CODEOWNERSで `.github/workflows/` にsecurity teamを割り当てれば「変更」には approve が要るが、「削除」だけを特別扱いすることはできない。

policy-bot には `file_deleted` / `file_added` という predicate がある。「変更ではなく削除されたときだけ有効化」というルールが書ける。

```yaml
approval_rules:
  - name: workflow deletion needs security review
    if:
      file_deleted:
        globs: [".github/workflows/**"]
    requires:
      count: 1
      teams: ["org/security"]
```

通常のワークフロー修正PR（ファイルが残っている）ではこのルールはskippedになり、既存の承認フローを邪魔しない。ワークフローが1つでも削除されているPRのときだけ有効化され、security team の追加承認が必要になる。

同じパターンで `.dockerignore` の削除、`Dockerfile` の新規追加、`go.sum` の大幅削減などを検知するルールも作れる。「普段は透過、危険パターンでのみ追加の目を入れる」という運用を書けるのがメチャクチャ便利だと思う。

### 組織横断で shared policy を配布する

リポジトリが増えるたびに `.policy.yml` を配って回るのはダルい。特に security / compliance のような「全リポジトリで共通のルールを効かせたい」ものは中央で管理したくなる。

policy-bot はデフォルトで、リポジトリに `.policy.yml` がない場合に同じ組織の `.github` リポジトリの `policy.yml` を見に行く。

```
github.com/example-org/
├── .github/
│   └── policy.yml              ← 組織横断のデフォルトポリシー
├── service-auth/               ← .policy.yml があれば上書き
├── service-billing/            ← 無ければ .github/policy.yml を継承
└── service-new-repo/           ← 新規リポジトリも自動継承
```

新規リポジトリが作られた瞬間から shared policy が適用されるので、セットアップ漏れが起きない。security 側のポリシーを `.github` repo で更新すれば、全リポジトリに即座に反映される。個別リポジトリでカスタムしたければ `.policy.yml` を置けば上書きされる、という逃げ道もある。

ちなみに「ローカル `.policy.yml` があっても shared policy を強制したい」という要件だと、本家 palantir 版にはオプションがなく、mercari fork の `force_shared_policy` が要る（後述）。

### Simulation API でポリシー変更を dry-run する

policyを変えたいとき、既存のopen PRがどう判定されるかが気になる。厳しくしすぎて全PRがpendingになるのも、緩くしすぎて意図しない自動承認が出るのも避けたい。

policy-bot には Simulation API がある。実PRに対して「このポリシーを適用したらどう判定されるか」を dry-run できる。実際のstatus checkは書き換えない。

```bash
curl https://policybot.example.com/api/simulate/org/repo/123 \
  -H 'authorization: Bearer <token>' \
  -H 'content-type: application/json' \
  -X POST -d '{}'
```

空のbodyを渡すと「現状そのままの評価」をするが、ここに「仮に @alice が approve したら」「仮に @bob の review を無視したら」「仮に base branch が別だったら」といった仮想条件を入れて評価を変えられる。

```json
{
  "add_reviews": [
    {"author": "alice", "state": "approved", "body": "LGTM"}
  ],
  "ignore_reviews": {
    "users": ["bob"]
  },
  "base_branch": "release/v2"
}
```

運用パターンとしては、CIで policy.yml の PR に対して「現在のopen PR群にこのpolicyを適用したら何が変わるか」を走らせて差分レポートを出す、というのが便利そう。Terraform の plan と同じ感覚で、policy変更による影響が事前に可視化できる。ポリシーの変更は本番環境の承認フローを変えることになるので、この dry-run の仕組みは割と安心材料になる。

ちなみにポリシー自体の構文エラーは別の Validate API（`/api/validate`）や CLI (`policy-bot validate`) でもチェックできる。これはCIで .policy.yml の lint として使うと良さそう。

## どちらを使うか

承認ポリシーとして「書ける範囲」で比べると policy-bot が圧倒的に強い。CODEOWNERSでできることはpolicy-botでも書けるが逆は成り立たない。条件分岐、自動承認、AND/OR、PR属性に応じたルール切り替えなど、「承認ロジックをコードとして表現する」ための機能はほぼ policy-bot にしかない強みといえる。

一方でCODEOWNERSにも強みはあって、主に以下の2つ。

1つはGitHubネイティブで動くこと。PR画面のReviewers欄に Code Owner バッジが出る、該当パスの担当者に自動で review request が飛ぶ、`.github/CODEOWNERS` の構文を GitHub 側がバリデーションしてくれる、Ruleset / Branch protectionの「Require review from Code Owners」と直接連携する、といったUI連携が標準でついてくる。policy-botはstatus checkとWeb UIでPRの承認状況を見せてくれるが、「誰がこのコードの責任者か」をPR画面で直接示せるのはCODEOWNERSの良い部分に思う。

もう1つはシンプルさ、そして運用コストの低さ。CODEOWNERSは`path owner`を1行ずつ書くだけで、学習コストがほぼない。チームに入ったばかりの人でも5分で読めるし書ける。GitHub Appを立てる必要も、認証鍵の管理も、サーバの運用もない。policy-botはGitHub AppとしてApp hostingが必要で、運用コストが常にかかる。YAMLの predicate / requires / options / rule 状態といった独自概念を覚える学習コストもゼロではない…(けどCoding Agentに任せればいいという面もある)。

機能の豊富さだけで決まるなら迷わずpolicy-botを選ぶのだが、このあたりの軸とのトレードオフを見て判断することになる。単純な責任分担で済むならCODEOWNERS、条件ベースのポリシーが要るならpolicy-bot、というのが分かりやすい分かれ目かな。

## 補足: mercari/policy-bot fork

[mercari/policy-bot](https://github.com/mercari/policy-bot)というforkが存在する。本家palantir版に独自の機能を足したものだ。READMEは本家と同一で独自機能のドキュメントがなかったので、ざっと調べた結果をまとめておく。

### Actorの user_types と not

bot だけ / 人間だけを承認者として指定できる。`not`による除外も書ける。本家ではこの粒度の制御ができない。

```yaml
actors:
  user_types: [Bot]           # Bot / User で区別
  not:                        # 否定マッチ
    users: [excluded-user]
```

### force_shared_policy

組織の`.github` repoにあるshared policyを強制し、リポジトリ側の`.policy.yml`を無視する。本家にもshared policy機能はあるが、ローカルにポリシーファイルがある場合はそちらが優先されるので、強制したいケースではこのforkの機能が要る。

### status_check_context_ignore_base

デフォルトのstatus contextは`policy-bot: <base-branch>`となり、target branchごとに別の status check として見える。`status_check_context_ignore_base: true`にするとベースブランチ名を含めなくなり、branch protectionで required 指定する際に扱いやすくなる。

### status_check_description_prefix

status checkのdescriptionにstate別 prefix（`[OK]`、`[NG]`など）を付けられる。success / pending / failure / error それぞれで別の prefix を設定できる。

### palantirとのマイナス差分

本家は積極的に更新されていて、mercari forkは数ヶ月遅れで追従している。

- Goのバージョン（palantir 1.26 / mercari 1.25）
- go-github（v84 / v82）
- glob patternサポート
- Simulation endpointの拡張

OpenTelemetryサポートが一度入ったが2026/1に削除されていた。

基本的にはpalantir本家を使うで良さそうが、`force_shared_policy`や`user_types: [Bot]`のような機能が欲しい場合はmercari forkを参考にしてもいいかもしれない。

## policy-botでも足りないユースケース

CODEOWNERSをpolicy-botで補強できる範囲は広い。ただ、個人的にはそれでも拾いきれない要件もあって、ユースケース単位で挙げてみる。

### ポリシーをディレクトリ別に分割する

モノレポでサービスごとに別チームが運用している構成だと、各チームが自チーム配下のポリシーを自分で管理したい、という要求が出てくる。[Kubernetes の OWNERS ファイル](https://www.kubernetes.dev/docs/guide/owners/)がこの形で、ディレクトリツリーに `OWNERS` ファイルを置いておけば、変更ファイルから近い OWNERS が順に評価される。

policy-bot の policy ファイルはリポジトリ root の `.policy.yml` 1枚だけで、サブディレクトリ別の policy ファイルという概念がない。`remote` 参照で他リポジトリの policy を指す、`.github` repo の shared policy を fallback として読む、といった「ファイル丸ごと差し替え」の仕組みはあるが、ベース policy にパス別オーバーライドを足すような階層的な合成（kustomize の overlay 的なもの）は持っていない。

サービスごとの責任分担を表現したい場合、結局 root の `.policy.yml` に全サービス分のルールを `if: changed_files: ...` で並べる構成になる。チームごとに自分の領域だけ管理する、というのは難しい。

### Release に含まれる PR から動的に reviewer を引く

[tagpr](https://github.com/Songmu/tagpr) や [release-please](https://github.com/googleapis/release-please) のようなツールは、前回リリースから今回リリースに含まれる commit / PR をまとめた release PR を自動生成する。この release PR に対して「含まれている個別 PR の author を reviewer に動的に assign したい」という要件が出てくる。release に自分の変更が入っている人は、その変更が意図通りに含まれているか、意図しない差分が混ざっていないかを確認する動機がある。

CODEOWNERS や policy-bot はあくまで「PR に対して static に定義された reviewer / approver」を扱う仕組みで、「release の中身を逆引きして author を引っ張ってくる」のような動的な assign はできない。tag 間の commit 列挙や PR の関連付けには GitHub API を呼んでそれぞれ取得する必要がある。YAML だけでこれを表現するのはそもそも難しい。

### module バージョン bump に連動した動的 reviewer

社内ライブラリや Terraform module などバージョンを切っているコンポーネントの version を bump する PR に対して、「その version 区間で module に commit した人を reviewer にアサインする」という運用ができると嬉しい。CHANGELOG を読まなくても、実質的な変更者がレビューの場に自動で呼ばれる。

これも bump 元リポジトリの commit 履歴を逆引きする処理が必要で、static な YAML ポリシーでは無理なケース。

…

これらに共通しているのは、「PR と policy ファイルだけを見ても reviewer が決まらない」という性質だ。policy ファイルを分割したい要求は config 構造の話で、release PR や module bump は周辺リポジトリの commit 履歴を逆引きしたい話だが、いずれも policy-bot の宣言的な YAML だけでは表現が難しい。このあたりは policy-bot のスコープ外で、別の仕組みを併用して補う領域だと思う。

## おわりに

CODEOWNERSはシンプルさと GitHub ネイティブな部分が強みで、基本的な責任分担ならこれで十分に回る。policy-botはその範囲を超えて条件ベースの承認ロジックが必要になったときに選択肢に入るツール、という位置づけになる。要件が「path以外の条件でルールを変えたい」「自動承認を作りたい」「AND条件を強制したい」のいずれかに該当し始めたら、policy-botの導入を検討すると良さそう。

## 参考

- [palantir/policy-bot](https://github.com/palantir/policy-bot)
- [mercari/policy-bot](https://github.com/mercari/policy-bot)
- [GitHub Docs: About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-policies/customizing-your-repository/about-code-owners)
