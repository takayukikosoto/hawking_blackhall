# Hawking Radiation Simulator — Spectrum, Species & Lensing

**ブラウザで動く可視化**。以下を追加：
- **スペクトル**：黒体近似（E ∼ kT·Gamma(4) 近似）でエネルギーをサンプル
- **粒子種**：γ（フォトン）/ ν（ニュートリノ）/ g（グラビトン）の比率をUIで調整
  - 色と寿命を種別・エネルギーでマッピング（E↑ → 寿命↓、ν/gは長寿命寄り）
- **重力レンズ**：スクリーンスペース近似（BHの画面中心とスクリーン半径から、radial offset ~ (r_s / r) でテクスチャ座標を歪め、Einstein ringを強調／色収差オプション）

> 物理は学習可視化向けの簡略版。一般相対論の厳密なレイトレーシングやグレーボディ因子は未導入。

## 🚀 セットアップ

### 必要な環境
- Node.js 18以上
- Python 3.8以上（APIサーバーを使用する場合）

### インストール

```bash
# Node.js依存関係のインストール
npm install

# Python依存関係のインストール（APIサーバーを使用する場合）
pip install -r requirements.txt
```

## 📡 開発サーバーの起動

### フロントエンドサーバー（Node.js）

```bash
npm run dev
# または
npm start
```

ブラウザで `http://localhost:8080` を開きます。

### Python APIサーバー（オプション）

別のターミナルで：

```bash
# FastAPI版（推奨）
npm run api
# または
uvicorn api.server:app --host 0.0.0.0 --port 8001 --reload

# 旧Flask版（互換性のため残しています）
python api/server.py
```

APIサーバーは `http://localhost:8001` で起動します。
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

## 🎮 使い方

1. 開発サーバーを起動
2. ブラウザで `http://localhost:3000` を開く
3. 「Black Hole」「Emission」「Lensing」で調整
4. スクショ保存も可能

## 📚 API エンドポイント

Python APIサーバーが起動している場合、以下のエンドポイントが利用可能です：

- `GET /api/health` - ヘルスチェック
- `POST /api/blackhole/calculate` - ブラックホールの物理量を計算
  ```json
  {
    "mass_solar": 10.0
  }
  ```
- `POST /api/particles/spawn-rate` - パーティクルの生成率を計算
  ```json
  {
    "mass_solar": 10.0,
    "pair_rate_ui": 0.45
  }
  ```
- `GET /api/physics/constants` - 物理定数を取得

## 🔧 実装メモ

- T<sub>H</sub>=ħc³/(8πGMk<sub>B</sub>)、r<sub>s</sub>=2GM/c²、出力相対∝1/M²。
- スペクトルは Planck 分布 x³/(eˣ-1) を **Gamma(4)** で近似し高速サンプル（視覚上十分）。
- フォトンは E→λ=hc/E から 380–700nm の簡易RGB変換で色付け。ν/g は淡色。
- レンズはレンダーターゲット→フルスクリーンクアッドで**ポスト処理**、BHのスクリーン座標とr<sub>s</sub>画面半径を毎フレーム更新。

## 🏗️ プロジェクト構造

```
hawking-sim-pro/
├── api/
│   └── server.py          # Python APIサーバー
├── assets/
│   └── shaders/           # GLSLシェーダーファイル
├── constants.js           # 物理定数と計算関数
├── main.js                # メインアプリケーション
├── index.html             # HTMLエントリーポイント
├── style.css              # スタイルシート
├── server.js              # Node.js開発サーバー
├── package.json           # Node.js依存関係
├── requirements.txt       # Python依存関係
└── README.md              # このファイル
```

## 🔮 拡張余地

- GPGPU粒子（テクスチャベース）で10万〜100万粒子へ
- グレーボディ因子・スピン依存放射・多波長スペクトルの厳密化
- 背景銀河テクスチャ＋本格的スクリーンレイベンディング
- ペンローズ過程、回転BH（Kerr）のエルゴ球近似など

## 📝 ライセンス

MIT
