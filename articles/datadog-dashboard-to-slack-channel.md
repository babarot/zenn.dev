---
title: "Datadogダッシュボードをスクショして毎日Slackに送る"
emoji: "🗼"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["datadog", "go", "slack"]
published: true
---

こんにちは！今日は、Datadogのダッシュボードを毎日Slackに送信するための自動化について紹介します。Datadogには[Scheduled Reports](https://docs.datadoghq.com/dashboards/sharing/scheduled_reports/)というダッシュボードのサマリをメールで送信してくれる機能がありますが、PDF形式で送られてくるため、Slackでの視認性が良くなく他のメンバーにとって見づらいという問題がありました。そこで、Headlessブラウザを使ってスクリーンショットを撮影し、GitHub ActionsのCron機能([schedule workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule))を使って毎日定刻にSlackチャンネルに投稿する仕組みを作成しました。

## 背景

チーム内でSLO（Service Level Objective）を把握し、常に確認できる状態を作ることが重要です。SLOの進捗や成功率は、エンジニアだけでなく、非エンジニアや経営メンバーにも把握してもらいたいものです。しかし、DatadogのダッシュボードをPDFで送るだけでは、Slackでの視認性が悪く、なかなか目に入りづらいという問題がありました。

そこで、私たちはこの問題を解決するために、次のようなアプローチを取ることにしました:

- Datadogのダッシュボードを自動的にスクリーンショットとして保存
- GitHub ActionsのCron機能を使って、定期的にSlackに投稿

これにより、チーム全員が毎日SLOの状態を簡単に確認できるようになり、より迅速に状況を共有できるようになりました。

![](/images/datadog-dashboard-to-slack-channel/demo.png)
*実際の様子*

## 実装の流れ


1. Headlessブラウザでのスクリーンショット撮影
    - Headlessブラウザとは、ユーザーインターフェースを表示しないで、ウェブページの操作やスクリーンショットを取得するツールです。
    - 今回はGo言語のrodパッケージを使用して、Datadogのダッシュボードのスクリーンショットを撮ります。
2. GitHub Actionsによる定期実行
    - GitHub Actionsを使って、毎日定刻に自動的にスクリーンショットを撮り、Slackにアップロードするワークフローを設定します。

### スクリーンショット撮影のコード

まず、Goでスクリーンショットを撮るためのコードを紹介します。以下のコードでは、Headlessブラウザを使ってDatadogダッシュボードを開き、スクリーンショットを撮影してファイルに保存しています[^caution-go]。

```go
package main

import (
	"os"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

func main() {
	u := launcher.New().NoSandbox(true).MustLaunch()

	pageURL := os.Getenv("SHARING_SLO_URL")
	if pageURL == "" {
		panic("SHARING_SLO_URL is not set")
	}

	outputFile := os.Getenv("OUTPUT_FILE")
	if outputFile == "" {
		panic("OUTPUT_FILE is not set")
	}

	browser := rod.New().
		ControlURL(u).
		MustConnect().
		MustPage(pageURL).
		MustWindowFullscreen()

	// ページが安定するまで待機してスクリーンショットを撮影
	browser.MustWaitStable().MustScreenshotFullPage(outputFile)
	defer browser.MustClose()
}
```

このコードは、[rod](https://github.com/go-rod/rod)パッケージを使ってブラウザを制御し、指定したURL（Datadogダッシュボード）を開いて、全体のスクリーンショットを撮影します。撮影した画像は指定したファイル名で保存されます。

### GitHub Actionsのワークフロー

次に、GitHub Actionsを使用して、スクリーンショットを定期的に撮影し、Slackにアップロードする設定を行います。以下は、そのためのworkflowの設定ファイルです。


```yaml
name: Send SLO dashboard to Slack

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * *' # JST 9am everyday

jobs:
  ci:
    runs-on: ubuntu-latest
    env:
      LANG: ja_JP.UTF-8
      SLO_URL: https://app.datadoghq.com/dashboard/slo-page
      IMAGE_FILE: slo.png
      SLACK_CHANNEL_ID: xxxx
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v3
        with:
          go-version: 1.23
      - name: Install fonts-noto
        run: sudo apt install fonts-noto
      - name: Take screenshots
        run: |
          go run main.go
        env:
          SHARING_SLO_URL: https://p.datadoghq.com/sb/sharing-slo-page
          OUTPUT_FILE: ${{ env.IMAGE_FILE }}
      - name: Upload image to Slack
        uses: yanskun/slack-file-upload-action@v2
        with:
          token: ${{ secrets.SLACK_TOKEN }}
          path: ${{ env.IMAGE_FILE }}
          channel_id: ${{ env.SLACK_CHANNEL_ID }}
      - name: Post to a Slack channel
        uses: slackapi/slack-github-action@v3
        with:
          method: chat.postMessage
          token: ${{ secrets.SLACK_TOKEN }}
          payload: |
            channel: ${{ env.SLACK_CHANNEL_ID }}
            text: "<${{ env.SLO_URL }} | Company SLO (Success Rate)>"
```

このワークフローは、以下のステップを実行します：

1. Goのセットアップ
1. ブラウザ内の文字化けを防ぐため日本語環境をインストールする
1. Datadogダッシュボードのスクリーンショット撮影
1. 画像をSlackにアップロード
1. Slackチャンネルにメッセージを投稿

このように、GitHub Actionsのスケジュール機能（cron）を使って、毎日決まった時間にダッシュボードを撮影し、チームのSlackチャンネルに投稿することができます。[^caution-schedule]

## 結果

この仕組みを導入したことで、エンジニアだけでなく非エンジニアや経営メンバーもSLOの進捗を簡単に確認できるようになり、チーム内での認識が一致しやすくなりました。PDFよりも画像としてSlackに投稿することで、視認性も向上し、重要な情報を簡単に把握できます。


## まとめ

今回は、Datadogダッシュボードをスクリーンショットで毎日Slackに送信する自動化について紹介しました。GitHub Actionsを活用することで、定期的なレポートを自動的にチームと共有できるようになり、プロジェクトの状況を効率よく管理できるようになりました。

もし、あなたもDatadogを使用していて同じような課題を抱えているなら、この方法を試してみてください！

[^caution-go]: このアプローチではDatadogダッシュボードの[Sharing](https://docs.datadoghq.com/ja/dashboards/sharing/)機能を使って実装をラクしています。URLを知る人間だけがアクセスできるものですが、Publicに晒したくない場合はGoからDatadogにログインする実装を入れてください
[^caution-schedule]: GitHub Actionsの[schedule workflowは遅延します](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule)。JSTの午前9時としても30分くらい遅延してくるつもりでいましょう
