# デプロイガイド

## 推奨: Render（フロント+バック統合）

### メリット
- 無料プランあり
- GitHubから自動デプロイ
- Python/FastAPI完全対応
- 設定が簡単

### 手順

#### 1. Renderアカウント作成
https://render.com にアクセスしてアカウント作成

#### 2. GitHubリポジトリを接続
- Dashboard > "New +" > "Blueprint"
- GitHubリポジトリを選択: `takayukikosoto/hawking_blackhall`
- `render.yaml` を自動検出

#### 3. 環境変数の設定（必要なら）
特に設定不要（デフォルトで動作）

#### 4. デプロイ
自動的にデプロイが開始されます。

### アクセスURL
- フロントエンド: `https://hawking-sim-frontend.onrender.com`
- API: `https://hawking-sim-api.onrender.com`
- API Docs: `https://hawking-sim-api.onrender.com/docs`

---

## 代替案1: GitHub Pages + Render

### フロントエンド（GitHub Pages）

#### 1. GitHubリポジトリの設定
- Settings > Pages
- Source: "Deploy from a branch"
- Branch: `main` / `root`
- Save

#### 2. アクセスURL
https://takayukikosoto.github.io/hawking_blackhall/

#### 3. main.jsの修正が必要
```javascript
// API URLを変更
const API_BASE_URL = 'https://hawking-sim-api.onrender.com';
```

### バックエンド（Render）

#### 1. Renderで新しいWeb Serviceを作成
- Dashboard > "New +" > "Web Service"
- GitHubリポジトリを選択
- 設定:
  - Name: `hawking-sim-api`
  - Environment: `Python 3`
  - Build Command: `pip install -r requirements.txt`
  - Start Command: `uvicorn api.server:app --host 0.0.0.0 --port $PORT`
  - Plan: `Free`

#### 2. CORS設定
`api/server.py` で以下を確認:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番では適切なオリジンを指定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 代替案2: Vercel（フロントエンド高速化）

### 1. Vercelアカウント作成
https://vercel.com

### 2. GitHubリポジトリをインポート
- Dashboard > "Add New..." > "Project"
- GitHubリポジトリを選択

### 3. 設定
- Framework Preset: `Other`
- Root Directory: `./`
- Build Command: （空欄）
- Output Directory: `./`

### 4. 環境変数
不要

### 5. デプロイ
自動的にデプロイされます。

### アクセスURL
https://hawking-blackhall.vercel.app

---

## 代替案3: Google Cloud Run（本格運用）

### バックエンド

#### 1. Dockerfileを作成
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8080"]
```

#### 2. デプロイ
```bash
gcloud run deploy hawking-sim-api \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated
```

---

## コスト比較

| サービス | フロント | バック | 月額 | 備考 |
|---------|---------|--------|------|------|
| **Render（両方）** | ✅ | ✅ | $0 | 15分でスリープ |
| **GitHub Pages + Render** | ✅ | ✅ | $0 | 高速フロント |
| **Vercel + Render** | ✅ | ✅ | $0 | 最速フロント |
| **Cloudflare + Cloud Run** | ✅ | ✅ | ~$5 | 従量課金 |

---

## 推奨環境変数

本番環境では以下を設定推奨:

```bash
# CORS設定（セキュリティ）
ALLOWED_ORIGINS=https://your-frontend-domain.com

# デバッグモード（本番ではFalse）
DEBUG=False

# ログレベル
LOG_LEVEL=INFO
```

---

## 注意事項

### 無料プランの制限
- **Render Free**: 15分無操作でスリープ、初回アクセス遅延あり
- **GitHub Pages**: 静的ファイルのみ、月100GBトラフィック
- **Vercel Free**: 月100GB帯域、関数実行時間制限

### 本番運用時
1. CORS設定を適切なオリジンに制限
2. レート制限を実装
3. エラーログの監視
4. 定期的なヘルスチェック

---

## トラブルシューティング

### API接続エラー
- CORSエラー: `api/server.py` のCORS設定を確認
- タイムアウト: Renderのスリープ解除に時間がかかる（初回のみ）

### デプロイエラー
- Python依存関係: `requirements.txt` を確認
- ポート設定: `$PORT` 環境変数を使用

---

## 参考リンク

- [Render Documentation](https://render.com/docs)
- [GitHub Pages](https://pages.github.com/)
- [Vercel Documentation](https://vercel.com/docs)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)

