---
title: "CloudflareでGitHub Pagesのカスタムドメインを設定する"
emoji: "🗼"
type: "tech"
topics: ["githubpages", "cloudflare"]
published: true
---

5分くらいで完了したので手順をまとめておく。

# 1. Cloudflare でドメインを購入する

![](https://storage.googleapis.com/zenn-user-upload/4e06797b0336-20250208.png)

Register Domains から好きなドメインを入力する。購入もカード情報とか入れて1,2分で取得できる。

ここでは `gomi.dev` を取ったものとして仮定する。

# 2. AレコードとCNAMEを設定する

![](https://storage.googleapis.com/zenn-user-upload/2dc8c5e3dba7-20250208.png)

Cloudflare のダッシュボード画面に行き、購入できているドメインを選択し、DNS Records からApexドメインの設定に移る。

GitHub 公式のマニュアルに従い、A レコードと CNAME を設定する。

https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

![](https://storage.googleapis.com/zenn-user-upload/a20ae5e4be31-20250208.png)

![](https://storage.googleapis.com/zenn-user-upload/1e84f43243c3-20250208.png)

ホスト名 | TYPE | VALUE
---|---|---
www.gomi.dev | CNAME | babarot.github.io
gomi.dev | A | 185.199.108.153
gomi.dev | A | 185.199.109.153
gomi.dev | A | 185.199.110.153
gomi.dev | A | 185.199.111.153

![](https://storage.googleapis.com/zenn-user-upload/5a2154fa3a3a-20250208.png)

# 3. CNAME ファイルをコミットし、リポジトリの Pages の設定画面で Custom domain の設定

## 3.1. コミットする

https://github.com/babarot/gomi/commit/57a3474e8541ba50b134039c10cf0a3dc574b272

```
docs
├── CNAME
├── demo.gif
├── index.html
└── main.css.png
```

## 3.2. Pages 設定する

![](https://storage.googleapis.com/zenn-user-upload/521b679139f0-20250208.png)

![](https://storage.googleapis.com/zenn-user-upload/176fbbfae2ae-20250208.png)
_入れた瞬間は Checin in progress... となるが数秒〜数分で DNS check successful となる。_

# 4. つながるか確認

https://gomi.dev

# 補足

gomi.dev は `babarot/gomi` の GitHub Pages であり[プロフィールの Pages](https://docs.github.com/pages/getting-started-with-github-pages/about-github-pages)ではない。プロフィールの方 (`babarot/babarot.github.io`) でもアクセスできるがリダイレクトされるようになっている。



```
babarot.github.io/gomi
↓
gomi.dev
```

ちなみに `babarot.github.io` は `babarot.me` でカスタムドメインを設定しているがそれも影響はない。

```
babarot.me/gomi
↓
gomi.dev
```
