---
title: "conftestでMarkdownの構造をバリデーションする"
emoji: "📏"
type: "tech"
topics: ["conftest", "opa", "rego", "markdown", "ci"]
published: true
---
## なぜMarkdownにスキーマが必要か

ドキュメントをMarkdownで管理するチームは多い。自分はOSSだが [Oksskolten](https://github.com/babarot/oksskolten) というアプリケーションのリポジトリで、仕様書、ADR（Architecture Decision Records）、ガイドといったドキュメントをリポジトリの `docs/` 配下に置いている。ただ、ファイルが増えてくると構造がバラバラになっていく。見出しの順序が人によって違う、必須セクションが抜けている、ファイル名の命名規則が守られていない...こういった問題はレビューで指摘し続けるのも限界がある。

最近はAIがドキュメントを読み書きする場面も増えた。[rules](https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/)やプロンプトで構造を指示することはできるが、必ず守られる保証はない。人間のレビューと同じで、お願いベースの制約はいつか破られる。機械的に検証できるスキーマがあれば、書き手が人間でもAIでも同じ基準で弾ける。

[markdownlint](https://github.com/DavidAnson/markdownlint)のような汎用linterはインデントや空行のスタイルを検証してくれるが、「feature specにはOverview・Motivation・Designセクションが必須」「ADRのStatusはAccepted/Deprecated/Supersededのいずれか」のようなドメイン固有の制約はカバーできない。

そこで[conftest](https://www.conftest.dev/)（[OPA](https://www.openpolicyagent.org/)ベースのpolicy testingツール）を使ってMarkdownの構造をCIで自動検証する仕組みを作った。簡単に言うと、MarkdownをASTに変換してJSONにし、そのJSONに対してRegoでポリシーを書くというアプローチである。

実際にリポジトリで、`docs/` 配下の3種類のドキュメント（spec、guides、ADR）に対して適用していい感じになったので紹介してみる。

## 仕組み

[remark](https://github.com/remarkjs/remark)（Markdownパーサー）の `--tree-out` でAST（Abstract Syntax Tree）をJSONとして出力し、そのJSONをconftestに食わせる。

```
Markdown
  ↓ remark --tree-out
JSON AST
  ↓ conftest test
Pass / Fail
```

例えば `## Overview` という見出しはこういうJSONノードになる:

```json
{
  "type": "heading",
  "depth": 2,
  "children": [{ "type": "text", "value": "Overview" }]
}
```

これに対してRegoでルールを書く。

## 全体構成

ドキュメント種別ごとにポリシーディレクトリを分離している。ディレクトリ構成はこうなっている:

```
docs/
├── spec/
├── guides/
└── adr/

policy/
├── spec/
├── guides/
└── adr/
```

`docs/spec/` に対しては `policy/spec/` のルールだけが適用され、guidesやADRのことは知らない。新しいドキュメント種別（例えば `docs/tutorials/`）を追加するときは `policy/tutorials/` を作ってスクリプトに1行足すだけで、既存ファイルに触らずに済む。この分離はconftest実行時に `--policy policy/spec` のようにポリシーディレクトリを指定することで実現している。

## どんなポリシーを書いているか

### spec: 仕様書

| ルール | 内容 |
|---|---|
| H1タイトル形式 | `Oksskolten Spec — {Title}` に一致すること |
| H1個数 | 1つであること |
| 禁止セクション名 | "Current Status", "Implementation Checklist" 等を禁止 |
| Key Filesテーブル | 2列（File, Description）であること |
| 見出し深度 | H4まで（H5以降は禁止） |
| Back to Overview | H1直後に `> [Back to Overview](./01_overview.md)` があること |
| overviewインデックス | `01_overview.md` が全specファイルへのリンクを含むこと |
| H2テンプレート | feature/perf specは Overview → Motivation → (Scope) → Design の順序・構成であること |
| ファイル名形式 | `{NN}_{snake_case}.md` であること |
| プレフィックス分類 | 8x → `_feature_`、9x → `_perf_` を含むこと |

feature spec（`8x_feature_*.md`）とperf spec（`9x_perf_*.md`）はH2のテンプレートを共有している。Overview（何）→ Motivation（なぜ）→ Design（どう）の3セクションが必須で、任意でScopeをMotivationとDesignの間に置ける。H2はこの4つのみ許可し、Design配下はH3/H4で自由に書ける。

### guides: ガイド

| ルール | 内容 |
|---|---|
| ファイル名形式 | 動名詞で始まるkebab-case（`creating-themes.md`） |
| H1↔ファイル名対応 | H1の最初の単語がファイル名の最初のセグメントと一致すること |

ガイドは「〜する方法」を説明するドキュメントなので、ファイル名を `verbing-object.md` 形式に統一している。`deploying-to-fly-io.md` は通り、`setup-guide.md` は弾かれる。

### ADR: Architecture Decision Records

| ルール | 内容 |
|---|---|
| ファイル名形式 | `{NNN}-{kebab-case}.md` であること |
| H1形式 | `ADR-NNN: {Title}` に一致すること |
| ファイル名↔H1番号対応 | ファイル名の3桁番号とH1の番号が一致すること |
| H1個数 | 1つであること |
| 必須H2 | Status、Context、Decision、Consequencesの4セクション |
| Status値 | Accepted / Deprecated / Superseded のいずれか |

ADRは[Michael Nygardのフォーマット](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)に準拠している。Status値のバリデーションは、ASTのインデックスを使って「`## Status` 見出しの次のparagraphノード」の内容をチェックしている。

## Regoの書き方

いくつか代表的なルールの実装を示す。

### 必須セクションの存在と順序

```rego
_required_h2s := ["Overview", "Motivation", "Design"]

_h2_names := [heading_text(h) |
  some h in input.children
  h.type == "heading"
  h.depth == 2
]

# 必須セクションの存在チェック
deny contains msg if {
  _is_templated_spec
  some required in _required_h2s
  not required in {name | some name in _h2_names}
  msg := sprintf("%s spec must have '## %s' section", [_spec_type, required])
}

# 順序チェック（Scopeは任意なので除外して比較）
_h2_names_without_scope := [name | some name in _h2_names; name != "Scope"]

deny contains msg if {
  _is_templated_spec
  every required in _required_h2s {
    required in {name | some name in _h2_names}
  }
  _h2_names_without_scope != _required_h2s
  msg := sprintf("%s spec H2 order must be: Overview → Motivation → (Scope) → Design",
    [_spec_type])
}
```

H2見出しのテキストをリストとして抽出し、必須リストとの差分で存在チェック、リスト比較で順序チェックを行う。

### AST走査によるリンク収集

`01_overview.md` が全spec ファイルへのリンクを含んでいるかの検証。Regoは再帰関数を書けないが、OPA組み込みの `walk()` でネスト構造を走査できる。

```rego
_all_link_urls := {url |
  walk(input, [_, node])
  node.type == "link"
  url := node.url
}

deny contains msg if {
  filename == "01_overview.md"
  some f in all_filenames
  f != "01_overview.md"
  expected_url := sprintf("./%s", [f])
  not expected_url in _all_link_urls
  msg := sprintf("01_overview.md must link to all spec files, missing: '%s'", [f])
}
```

### 隣接ノードの値チェック

ADRのStatus値チェック。remarkのAST（[mdast](https://github.com/syntax-tree/mdast)準拠）は見出しとコンテンツがフラットに並ぶので、`children[i + 1]` で隣接ノードにアクセスする。

```rego
deny contains msg if {
  some i, node in input.children
  node.type == "heading"
  node.depth == 2
  _adr_heading_text(node) == "Status"
  next_node := input.children[i + 1]
  next_node.type == "paragraph"
  status_text := concat("", [c.value | some c in next_node.children; c.type == "text"])
  not status_text in {"Accepted", "Deprecated", "Superseded"}
  msg := sprintf("ADR Status must be one of {Accepted, Deprecated, Superseded}, got: '%s'",
    [status_text])
}
```

## ユニットテスト

conftestには `conftest verify` でRegoのユニットテストを実行する機能がある。`*_test.rego` をポリシーと同じディレクトリに置く。

```rego
# ヘルパー: 最小限のASTノードを生成
h(depth, text) := {
  "type": "heading", "depth": depth,
  "children": [{"type": "text", "value": text}]
}

feature_doc(children) := {
  "type": "root", "children": children,
  "metadata": {"is_feature": true}
}

# 正常系
test_feature_h2_all_required_pass if {
  count(deny) == 0 with input as feature_doc([
    h(1, "Oksskolten Spec — Clip"),
    h(2, "Overview"),
    h(2, "Motivation"),
    h(2, "Design"),
  ])
}

# 異常系
test_feature_h2_missing_motivation if {
  "Feature spec must have '## Motivation' section" in deny
    with input as feature_doc([
      h(1, "Oksskolten Spec — Clip"),
      h(2, "Overview"),
      h(2, "Design"),
    ])
}
```

remarkの実際のASTを再現する必要はなく、ルールが参照するフィールドだけを持つ最小限のJSONで十分。

## スクリプトとCI

conftestはJSON入力を期待するので、Markdownをそのままconftestに渡すことはできない。間にシェルスクリプトを挟んで、remarkでAST変換 → メタデータ注入 → conftest実行、という3ステップをつないでいる。

メタデータ注入が必要な理由は、Regoのルールがファイル名やドキュメント種別（feature specかperf specか）を知る必要があるからである。remarkのASTにはファイル名の情報がないので、jqでマージしてからconftestに渡す。

```bash
convert_to_ast() {
  local docs_dir="$1" scope="$2" metadata_fn="$3"
  [ -d "$docs_dir" ] || return 0
  mkdir -p "$tmpdir/$scope"
  for file in "$docs_dir"/*.md; do
    [ -f "$file" ] || continue
    local name=$(basename "$file")
    local metadata=$("$metadata_fn" "$name")
    (
      remark --tree-out < "$file" \
        | jq -s ".[0] * $metadata" \
        > "$tmpdir/$scope/$name"
    ) &
  done
  wait
}

run_conftest() {
  local scope="$1"
  ls "$tmpdir/$scope"/*.md &>/dev/null || return 0
  (cd "$tmpdir/$scope" && conftest test --parser json \
    --policy "$PROJECT_ROOT/policy/$scope" *.md)
}

convert_to_ast "docs/spec"   "spec"   spec_metadata   &
convert_to_ast "docs/guides" "guides" simple_metadata &
convert_to_ast "docs/adr"    "adr"    simple_metadata &
wait

run_conftest "spec"
run_conftest "guides"
run_conftest "adr"
```

`convert_to_ast` 内ではファイルごとのremark変換を `&` で並列実行し、さらに3つの `convert_to_ast` 自体も並列で走らせている。conftest実行時に `cd` してからファイルを渡しているのは、エラー出力をbasenameだけにして読みやすくするためである。

CIではドキュメントやポリシーに変更がある場合だけジョブを起動する:

```yaml
lint-docs:
  name: Docs Lint
  needs: detect-changes
  if: needs.detect-changes.outputs.docs == 'true'
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
    - name: Install conftest
      run: |
        curl -fsSL https://github.com/open-policy-agent/conftest/releases/download/v0.65.0/conftest_0.65.0_Linux_x86_64.tar.gz \
          | tar xz -C /usr/local/bin conftest
    - run: npm ci
    - name: Verify Rego tests
      run: |
        conftest verify --policy policy/spec
        conftest verify --policy policy/guides
        conftest verify --policy policy/adr
    - name: Lint docs
      run: bash scripts/lint-docs.sh
```

## 知っておくべき制約

**mdast ASTのフラット構造**: remarkのASTでは見出しがセクションのコンテナではなくフラットなノードになる。`## Design` とその配下の `### API` は兄弟ノード。「Designセクション内のH3」を直接クエリするにはインデックスの範囲計算が必要で、Regoがやや複雑になる。見出しのテキスト・順序・ファイル名の検証（つまり「スキーマ」レベル）にはこのアプローチが十分機能するが、セクション内のコンテンツの細かい検証にはあまり向かない。

**Regoの再帰禁止**: AST を再帰的に走査する関数は書けない。OPA組み込みの `walk()` で対処できるが、知らないとハマる。

## まとめ

remarkでJSON ASTに変換し、conftestでポリシーを書く。この仕組みのおかげで、ドキュメントの構造をCIで強制できるようになった。「必須セクションが抜けている」「見出しの順序が違う」「ファイル名が規則に従っていない」といった問題はマージ前に自動で弾かれる。レビューで同じことを指摘する必要がなくなった。

守らせたいポリシーをRegoで書くだけでMarkdownに構造的な制約を課せるのは、conftestの汎用性があってこそである。YAMLやJSONのバリデーションと同じ道具立てでMarkdownも扱えるのはコスパがよく便利だ。

https://github.com/babarot/oksskolten
