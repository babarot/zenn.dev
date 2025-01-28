---
title: "UNIX rm コマンドのより安全な代替ツール「gomi」"
emoji: "🗑️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["go", "cli"]
published: true
---

皆さん、CLIでファイルを削除する際に、rm コマンドを使うことが多いと思います。しかし、誤って大事なファイルを削除してしまった場合、それを復元するのは非常に困難です。そんな問題を解決するために登場したのが、[gomi](https://github.com/babarot/gomi)というツールです。

gomi（日本語で「ゴミ」）は、Goで書かれたシンプルなCLIツールで、コマンドラインに「ゴミ箱」機能を追加します。これにより、削除したファイルを簡単に復元することができるようになります。rmコマンドの代わりに使うことで、より安全で便利にファイル管理ができるようになります。

https://github.com/babarot/gomi

## 主な機能

- rm コマンドと同じように動作しますが、ファイルを完全に削除するのではなく、ゴミ箱に移動します
- 直感的なUIで簡単にファイルを復元できます
- rm コマンドのほとんどのオプションに対応しています
- 削除されたファイルを簡単に検索でき、ファジー検索機能を提供します
- YAML形式の設定ファイルを使って、gomiの動作や外観をカスタマイズできます:
    - 表示するファイルをフィルタリング（正規表現、ファイルサイズ、パターンなど）
    - ファイル内容の色付けをカスタマイズ
    - ディレクトリ内容をリストするコマンドの指定
    - 選択されたファイルの色など、視覚的なスタイルの変更

![](https://storage.googleapis.com/zenn-user-upload/ea42e266d634-20250129.gif)

## 使用方法

gomi は rm のオプション（例えば、-i、-f、-r など）に対応しているため、以下のようにエイリアスを設定するだけで簡単に rm の代わりに使うことができます。

```bash
alias rm=gomi
```

gomi は rm の代替ツールとして設計されていますので、エイリアスを設定することをお勧めしますが、設定しなくても使うことはできます。ここではエイリアスを設定した場合の使い方を説明します。

`rm` でファイルをゴミ箱に移動します。

```bash
rm files
```

`rm -b` でファイルを元の位置に復元します。-b は --restore オプションのショートハンドです。

```bash
rm -b
```

## インストール方法
### バイナリからインストール

[GitHub Releases](https://github.com/babarot/gomi/releases/latest) からバイナリをダウンロードし、$PATH に追加するだけです。

### CLIパッケージマネージャを使用
[afx](https://github.com/babarot/afx) を使ってインストールすることもできます。以下のように設定ファイルを使ってインストールできます。


```yaml
github:
- name: babarot/gomi
  description: CLI向けゴミ箱
  owner: babarot
  repo: gomi
  release:
    name: gomi
    tag: v1.2.2
  command:
    link:
    - from: gomi
    alias:
      rm: gomi # afx を使うと alias の設定も一緒にできます
```
```bash
afx install
```

## 設定

最初から使いやすい設定にしてあるため積極的に変更する必要はありませんが、使い勝手をより細かにチューニングしたい場合は設定ファイル (YAML形式) を使って、動作や外観をカスタマイズすることができます。gomi を初めて実行すると、~/.config/gomi/config.yaml にデフォルトの設定ファイルが自動的に作成されます。

```yaml
core:
  restore:
    confirm: false  # 復元前に確認を求めるかどうか（yes/no）
    verbose: true   # 詳細な復元情報を表示するかどうか
ui:
  density: spacious # または compact
  preview:
    syntax_highlight: true
    colorscheme: nord  # 使用可能なテーマ一覧はこちら: https://xyproto.github.io/splash/docs/index.html
    directory_command: ls -F -A --color=always
  style:
    list_view:
      cursor: "#AD58B4"   # 紫色
      selected: "#5FB458" # 緑色
      indent_on_select: false
    detail_view:
      border: "#FFFFFF"
      info_pane:
        deleted_from:
          fg: "#EEEEEE"
          bg: "#1C1C1C"
        deleted_at:
          fg: "#EEEEEE"
          bg: "#1C1C1C"
      preview_pane:
        border: "#3C3C3C"
        size:
          fg: "#EEEEDD"
          bg: "#3C3C3C"
        scroll:
          fg: "#EEEEDD"
          bg: "#3C3C3C"
  exit_message: bye!   # カスタマイズ可能な終了メッセージ
  paginator_type: dots # または arabic

history:
  include:
    within_days: 100 # 過去100日以内に削除されたファイルのみ表示
  exclude:
    files:
    - .DS_Store      # .DS_Storeファイルを除外
    patterns:
    - "^go\\..*"     # "go." で始まるファイルを除外
    globs:
    - "*.jpg"        # JPEGファイルを除外
    size:
      min: 0KB       # 空のファイルとディレクトリを除外
      max: 10GB      # 10GBを超えるファイルとディレクトリを除外
```

## まとめ

この記事を書くにあたり、同様のツールがないか調べてみると他にも多く存在することが分かりました。みんな似たようなことを考えているんですね。これらのツールはまさに、日常的なセーフティネットとして機能します。自分のニーズにぴったりのツールを選べれば、より安心して作業が進められることでしょう。

以下、同様のツールのリンクをまとめました。自分に合ったものをぜひ見つけてみてください。

- https://github.com/andreafrancia/trash-cli
- https://github.com/sindresorhus/trash
- https://github.com/theimpossibleastronaut/rmw
- https://github.com/nivekuil/rip
- https://github.com/alphapapa/rubbish.py
- https://github.com/kaelzhang/shell-safe-rm
- https://github.com/nateshmbhat/rm-trash
- https://github.com/PhrozenByte/rmtrash
- https://github.com/icyphox/crap
- https://github.com/ali-rantakari/trash
- https://github.com/rushsteve1/trash-d
- https://github.com/Kwpolska/trashman
- https://github.com/robrwo/bashtrash/
- https://github.com/oberblastmeister/trashy
- https://github.com/celediel/gt
- https://github.com/umlx5h/gtrash
- https://github.com/hudson-newey/2rm
