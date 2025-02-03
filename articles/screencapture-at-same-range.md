---
title: "全く同じ場所でスクリーンショットを撮る"
emoji: "🗼"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["macOS"]
published: true
---

全く同じ場所でスクリーンショットを撮りたいときがある。

同じものを撮るが一部の条件だけ (例えば `prefers-color-scheme: light` | `dark`) 変えて撮りたい場合などだ。同じものを撮るので 1px でもズレてほしくない。そういうときに Command+Shift+4 で範囲選択するのは至難の業だ。

そんなときは `screencapture` コマンドが役に立つ。

```console
screencapture -x -R2250,1200,500,260 a.png
```

使い方は `-R` に続けて X座標, Y座標, width, height だ。

a.png | b.png
---|---
![](https://storage.googleapis.com/zenn-user-upload/84fddeb3f1df-20250203.png) | ![](https://storage.googleapis.com/zenn-user-upload/bb59823ac9e9-20250203.png)
