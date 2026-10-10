---
title: "Synology NASを読むCLIを作り、AIからも診断できるようにした"
emoji: "🗄️"
type: "tech"
topics: ["synology", "nas", "cli", "mcp", "go"]
published: false
---
## なぜNASをCLIで見たいか

自宅で Synology の NAS（DS923+）を使っている。動画や写真を置き、セルフホストのアプリもいくつか Container Manager で動かしている。

最近は、自分のターミナルでコマンドを打っているのは自分ではなく AI のことが多い（[dotfiles を AI agent のために作り変えた](https://tellme.tokyo/post/2026/10/01/ai-agent-first-dotfiles/)話も書いた）。コードのことなら Claude Code に聞けばすぐ答えが返ってくるが、NAS のことは聞けない。「容量はあとどれくらい？」「落ちてるコンテナある？」と聞きたいが、現状 AI には NAS の状態を知る手段がなかった。

NAS の状態は DSM（Synology の管理画面）を見ればわかる。ただ DSM はブラウザの GUI なので、AI には読めない。自分で見るにしても、まず NAS の IP アドレスを調べるところから始まる。IP は DHCP で振られるので 192.168.1.13 だったり 192.168.1.23 だったりと変わり、ブックマークもできない。今のアドレスを調べて、ブラウザで開いて、ログインしてやっと見られる。ちょっと確認したいだけなのに、これが地味に面倒だった。

なので、NAS の状態をターミナルから読めるようにする CLI を作った。人間がターミナルから使えて、同じものを AI もそのまま使える、というのが狙い。

https://github.com/babarot/syno

## synoの機能

最初は「[finds.synology.com](https://finds.synology.com/) を CLI でやりたい」というところから始まった。finds.synology.com は、LAN 内の Synology を見つけて IP アドレスを出してくれるページ。そこから、ディスクなどの状態も見たい、診断もしたい、と広がって今の形になった。

```console
$ syno discover   # LAN 内の NAS を探す
$ syno login      # 一度ログインして、プロファイルとして保存する
$ syno status     # システム、プール、ボリューム、ディスク
$ syno doctor     # 健康診断。終了コードつき
$ syno dashboard  # 同じものを Web ページで見る
```

### 見つける

finds.synology.com の JS を読むと、LAN を探しているのではなかった。NAS が Synology のクラウドに登録した情報を、ブラウザのグローバル IP で引いて表示しているだけ。API を直接叩くと CloudFront に 403 で弾かれたので、これに乗るのはやめて、LAN の中だけで探すことにした。

`syno discover` は、3つの手がかりを組み合わせて NAS を探す。

- mDNS: NAS が自分で名乗っている名前と IP が取れる
- ARP テーブル: Synology の MAC アドレスの先頭（OUI）で絞り込める
- `SYNO.API.Info`: DSM の Web API のうち、これだけはログインなしで答える。DSM が動いているかの確認に使える

IP アドレスが変わっていても、`syno discover` を打てばすぐに今のアドレスがわかる。

ちなみに mDNS は5回に1回くらい応答を取りこぼして名前が空になったので、取りこぼした機器には NAS の 5353 番に直接問い合わせて名前を補っている。

### ログインする

`syno login` で一度ログインすると、NAS の URL とアカウントがプロファイルとして保存され、パスワードは OS の keyring（macOS なら Keychain）に入る。2FA のアカウントでも、DSM が発行するデバイストークンを保存するので、2回目からはコードを聞かれない。複数台の NAS もプロファイルで切り替えられる。

NAS の証明書は、DSM の自己署名のものだったり、IP アドレスでつなぐのにドメイン名の証明書だったりして、普通の検証が通らないことが多い。かといって検証しないのは嫌なので、SSH の known_hosts と同じように、初回に証明書を見せて公開鍵をピン留めするようにした（TOFU、Trust On First Use）。以降はその鍵以外を受け付けない。パスワードを送るのは、必ずこの確認のあと。

### 状態を見る

`syno status` は、システム、CPU とメモリ、プール、ボリューム、ディスクを一度に出す。ディスクの温度や SMART、通電時間、プールの最後のスクラブ（データの整合性の検査）がいつだったか、空いているベイまで出る。

![](https://assets.babarot.dev/files/2026/10/e3181a2c676a18c6.png)
_syno status_

ほかにも、名詞と動詞の形でサブコマンドを揃えている（`gh pr list` と同じ形）。

- `syno share list`: どの共有フォルダが容量を使っているか。`--recycle` でゴミ箱の中身も集計する
- `syno container list`: Container Manager のコンテナ。`--usage` で CPU とメモリ
- `syno package list`: パッケージの更新の有無
- `syno api`: `gh api` のように、任意の DSM Web API を呼ぶ

どのコマンドにも `--json` がある。

### 診断する

`syno doctor` は、プールとボリューム、ディスク、温度、スクラブ、再起動待ち、DSM とパッケージの更新、セキュリティアドバイザー、証明書、コンテナの12項目を見る。終了コードは Nagios の慣習（0 が OK、1 が WARN、2 が FAIL、3 が判定不能）に合わせたので、cron や監視からそのまま使える。

![](https://assets.babarot.dev/files/2026/10/079511de3eed3a14.png)
_syno doctor_

しきい値は `~/.config/syno/config.yaml` で変えられる。

```yaml
doctor:
  skip: [dsm-update]
  thresholds:
    volume_usage: {warn: 85, fail: 95}       # percent
    disk_temperature: {warn: 50, fail: 60}   # Celsius
    scrub_age_days: 90
```

項目ごとの判定には、なるべく DSM 自身の判定を使っている。例えばセキュリティまわりは自前で判定せず、DSM のセキュリティアドバイザーの結果を取ってくるだけ。パッケージの更新は、セキュリティ更新があるときだけ WARN にした。更新はいつもいくつかあるので、全部を WARN にすると doctor がずっと WARN のままになって、監視に使えなくなる。

### 少しだけ操作する

syno は基本的に読むだけの道具だが、例外が2つある。`syno container start / stop / restart` と、Wake-on-LAN で NAS を起こす `syno wake`。コンテナの操作は実行前に確認を出し、`--yes` で省ける。答える端末がなければ、進めずにエラーにする。

### dashboard

`syno dashboard`（`syno dash`）は、同じ情報を localhost の Web ページで見せる。

![](https://assets.babarot.dev/files/2026/10/7b5a94b620894638.png)
_syno dashboard_

パネルごとに更新の間隔を変えていて（CPU とメモリは5秒、コンテナは30秒、ストレージは1分、診断は5分、ゴミ箱と更新の確認は1時間）、NAS に問い合わせるのはページが開いていて前に出ている間だけ。誰も見ていなければ NAS への呼び出しは0になる。常駐の監視ではなく、見たいときだけ `syno dash` で開くイメージで作った。

## synoの設計: 人間とAIが同じ答えを見る

ここからが syno で一番力を入れたところ。

syno には、同じ情報を出す口が4つある。人間が読む表、スクリプトが読む `--json`、AI が使う MCP のツール、そして dashboard。この4つは、どれも同じ関数からデータを作っている。

```
DSM Web API
    ↓
各コマンドのデータを作る関数（status、doctor、container、share ...）
    ├── 表（人間）
    ├── --json（スクリプト）
    ├── syno mcp のツール（AI）
    └── syno dashboard（ブラウザ）
```

なので、人間が `syno status` で見たものと、AI が `syno_status` ツールで受け取ったものが食い違うことはない。CLI に何かを足せば、そのまま AI にも dashboard にも届く。

### MCPサーバ

`syno mcp` は MCP（Model Context Protocol）サーバとして動き、Claude Code などから NAS に質問できるようにする。

```bash
claude mcp add syno -- syno mcp
```

ツールは読み取りだけで、どれも対応するコマンドの `--json` と同じものを返す。

| ツール | 同じもの |
|---|---|
| `syno_status` | `syno status --json` |
| `syno_doctor` | `syno doctor --json` |
| `syno_containers` | `syno container list --json` |
| `syno_packages` | `syno package list --json` |
| `syno_shares` | `syno share list --json` |
| `syno_api_list` | `syno api --list --json` |
| `syno_api` | `syno api`（`--allow-api` を付けたときだけ） |

すべての答えには、どの NAS から来たかを示す `host` が入っている。プロファイルはツールを呼ぶたびに決まり、ユーザーが `syno profile use` で切り替えれば向き先が黙って変わるので、AI がどの NAS の答えかを取り違えないようにするため。

### エージェント向けのスキル

MCP のツールで答えられない質問もある。そのために、AI に syno の使い方を教える Agent Skill（`SKILL.md`）を同梱している。Claude Code なら plugin で、スキルと MCP サーバを一度に入れられる。

```
/plugin install syno --marketplace babarot/syno
```

スキルを書くときに決めていたのは、CLI のオプションを列挙しないこと。オプションは syno を変えるたびに古くなる。最新のヘルプはいつも `syno -h` なので、それを SSoT（Single Source of Truth）にして、スキルの冒頭では「使う前に `-h` を読め」とだけ書いた。

> `syno -h` and `syno <command> -h` describe the commands, flags and output, and the descriptions of the `syno_*` MCP tools describe the tools. Read them before you use a command, rather than guessing; this skill does not repeat them, so that it does not go stale.

代わりにスキルに書いたのは、判断と手順。

- 経路の選び方: `syno_*` ツールがあれば使い、なければ CLI を `--json` で
- まず高水準のコマンド（`doctor`、`status`、`share list` など）で答え、足りないときだけ `syno api` を使う
- `syno api` で API を探す手順（次の章で書く）
- ユーザーに頼むべき場面: ログイン、証明書の信頼、NAS を変える操作

例外として、「この質問ならこの DSM の API」という対応表だけは `references/` に置いた。これは syno の知識ではなく DSM 側の知識なので、syno を変えても古くならない。

## 読み取りでも秘密は漏れる

syno の MCP は、最初から読み取りだけにすると決めていた。AI が NAS を壊すのは困るので。ただ、作っていくうちに、読み取りだけなら安全というわけでもないことに気づいた。

MCP のツールが返したものは、そのまま AI の提供元に送られる。そして DSM の API には、読むだけのメソッドでも秘密を返すものがある。例えばコンテナの一覧の API はコンテナの環境変数を返すし、通知メールや DDNS、バックアップの設定には、パスワードや API キーが入りうる。`syno container list` ではあえて環境変数を読まないようにしていたが、任意の API を呼べる `syno_api` があれば、それも取れてしまう。

なので `syno_api` は既定では無効にして、`syno mcp --allow-api` で明示したときだけ有効にした。plugin も `--allow-api` なしで登録する。有効にした場合も、メソッド名が読み取りに見えるもの（`list`、`get`、`info`、`get_` で始まるものなど）しか NAS に送らない。ただ DSM の API は非公開で、名前の付け方は保証されていないので、これは可能性を下げるだけで排除はしない、と README にも書いている。

秘密に見えるキーを名前で伏せ字にする案もあったが、入れなかった。非公開 API の欄名を網羅できない以上、伏せ字があると「伏せてあるから安全」という誤った安心感を生むと思った。

ちなみにこの方針は、syno を並行して作っていた2つの Claude Code のセッションが決めた。片方が `syno_api` を足す計画を書き、MCP を実装したもう片方が「読み取りでも秘密が漏れる」とレビューを返した。そこで2つのセッションに直接メッセージをやり取りさせて、方針を詰めてもらった[^sessions]。

同じ考え方で、ログインは必ずユーザーにやってもらう。パスワードは AI が受け取れば会話のログに残るし、証明書のピンを信頼するかはセキュリティの判断で、ピンの不一致は中間者攻撃かもしれない。2FA のコードはユーザーの手元にしかない。なのでスキルには、ログインが必要になったら調査を止めて、`syno login --host ... -u ...` という具体的なコマンドを示してユーザーに実行してもらう、と書いてある。

:::details 任意のコマンドを実行できるか調べた
NAS で何かを確かめるには SSH して `ls` するしかないので、これを syno からできないか調べたことがある。DSM の Web API には「コマンドを実行する」API はないが、DSM の UI がユーザー定義スクリプトを動かすのと同じタスクスケジューラ（`SYNO.Core.TaskScheduler`）を経由すればできる。パラメータは非公開なので、`syno api` で DSM 自身の UI の JS を取ってきて読み、タスクを作って実行して消すまでを `echo hello` で試すところまでは通った。

ただ作ってはいない。root で動くタスクも作れるので SSH（sudo なし）より強い権限になるし、MCP に出せば読み取りだけという前提が根本から崩れる。`ls` 程度なら SSH の方が簡単で安全だと思う。作るとしても MCP には出さない CLI 専用のサブコマンドにして、一般ユーザーの権限でしか動かさないつもり。
:::

## AIエージェントから使う

実際に Claude Code から使ってみた例を2つ。

### コマンドで足りないところは API で補う

スキルに書いたとおり、AI はまず高水準のコマンドで答え、コマンドがないところだけ `syno api` を使う。容量の相談をしたときが、ちょうどそういう流れになった。

NAS の状態を調べてと頼むと、AI は `syno doctor --json` と `syno status --json` を実行して、容量がだいぶ埋まっていることを返してきた。どの共有フォルダが容量を使っているかは `syno share list` で答えられて、1つのフォルダが96%を占めていた。ここまではコマンドだけで済んでいる。

一方で、そのフォルダのスナップショットを見るコマンドは syno にない。そこで AI は `syno api --list` で API を探して `SYNO.Core.Share.Snapshot` を見つけ、呼ぶ前に「返ってきた内容はモデルの提供元に送られるが、呼んでいいか」と確認してきた。了承すると、スナップショットは0件で、フォルダの中身そのものが容量を使っているとわかった。

syno が答えるのは NAS の状態までだが、そこから先の判断は AI との会話の中でそのまま続けられる。このときは HDD を足す話になり、SHR にどのサイズのディスクを足すとどれだけ増えるかの計算や、SHR-1 と SHR-2 の比較まで進んだ。今刺さっている HDD のメーカーを聞くと、`syno status --raw` から DSM の応答そのままを読んで、ベイごとのメーカー、型番、ファームウェアを出してくれた。

### syno と claude-recall を組み合わせる

syno が答えられるのは、NAS の今の状態まで。なぜそのコンテナを立てたのか、といった経緯は NAS には残っていない。そこで、Claude Code の過去のセッションを検索する自作の [claude-recall](https://github.com/babarot/claude-recall) と組み合わせると、経緯まで含めて答えられるようになる。

例えば NAS で nginx-1 というコンテナが 8081 番で配信していて、何のためのものか覚えていなかった。「なぜこれ配信しているのか、もう落としても良いのかを recall で調べて」と頼むと、AI は `syno_containers`（MCP）で今の状態を、recall で過去の会話を、並行して調べた。答えは、別のプロジェクトで NAS からの読み込みが遅い原因を調べたときに、「NAS の中身を HTTP で配る」案を試すために立てたもので、その案は採用されなかったので消してよい、というものだった。syno の出力からコンテナが数分前に再起動していることにも気づいて、自動で再起動する設定があるかもしれないので、止めるより削除した方が確実だとも添えていた。

syno が「今 NAS で何が動いているか」を、recall が「なぜそれを立てたか」を答え、AI が2つを合わせて「消してよいか」を判断している。syno を NAS の状態を読む部品として作っておくと、こういう組み合わせができる。

## 非公開APIとの付き合い方

DSM の Web API は、一部しか公式のドキュメントがない。自分の NAS には API が760個以上あったが、DSM はメソッドの一覧を返さない。syno を作るときも、スキルで AI に探させるときも、手探りで調べることになる。実際にやったことをまとめておく。

- 推測で書いて、`--raw` で突き合わせる: 最初から `syno status --raw` で DSM の応答をそのまま出せるようにしておいた。推測で書いた構造体を実機の応答と比べて直す。ベンダー名が空白で埋められていたり（`"WDC     "`）、プールの ID が内部の `reuse_1` だったりした
- パラメータなしで呼んで、メソッドの有無を調べる: メソッドがなければエラー 103、あってもパラメータが足りなければ 114 が返る。NAS を変えずに、`start` や `stop` があるかがわかる
- 版で応答の形が変わる: パッケージセンターの一覧の API は、v1 だとパッケージを1つも返さず、v2 だと113個返した
- 効かないパラメータがある: コンテナの一覧の `type` は `all` か `running` しか受け付けないのに、どちらを渡しても止まっているコンテナが返る
- 単位は合計から推定する: 共有フォルダの使用量には単位が書かれていない。全フォルダの合計がボリュームの使用量と0.3%以内で一致したので、MiB と判断した。単位を確かめられなかったクォータは出力から外した
- DSM の画面の JS を読む: DSM の UI も同じ API を叩いているので、NAS が配っている JS を `syno api` で取ってきて、`sendWebAPI` の呼び出しを探す

DSM は「失敗した理由」を返さないこともある。止まっていたコンテナを `start` するとエラー 1301 しか返ってこなかったが、コンテナの `State.Error` を読むと `network ... not found` と残っていた（Docker Compose のネットワークを作り直す前に作られたコンテナだった）。なので `syno container start` は、失敗したらこれを読んで理由を出すようにしている。

確かめた実機は DS923+（DSM 7.2.2）の1台だけなので、ほかの機種や DSM の版で応答が違うことはあると思う。そういうときも `syno status --raw` と `syno api` で、その NAS が実際に何を返しているかを見られる。

## まとめ

syno は Synology NAS の状態を読む CLI だが、自分の中では、NAS を AI に見せるための道具だと思っている。人間向けの表、`--json`、MCP、dashboard が同じ関数から作られているので、人間が見ても AI が見ても同じ答えが返る。そのうえで、AI に渡すものは読み取りだけ、読み取りでも秘密が混ざるものは明示したときだけ、ログインは人間が、という線を引いた。

作ってみて一番よかったのは、NAS のことを AI に聞けるようになったこと。ターミナルで作業している流れのまま、DSM を開かずに容量やコンテナの状態を確かめられるし、気になったことはそのまま次の調べ物や相談につなげられる。NAS を持っている人はぜひ試してみてください :-)

```bash
go install github.com/babarot/syno@latest
# または
nix profile install github:babarot/nur-packages#syno
```

https://github.com/babarot/syno

[^sessions]: syno は Claude Code と作っていて、機能ごとに git worktree を分けて、複数のセッションを並行で動かしていた。もう片方のセッションの誤報（zsh の `echo` が JSON の `\n` を本物の改行に変えていたせいで「syno が壊れた JSON を出している」と報告していた）を、もう一方が切り分けたこともある。
