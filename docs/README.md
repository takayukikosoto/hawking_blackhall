# Hawking Radiation Simulator Pro - ドキュメント

## ドキュメント一覧

- [物理計算の実装詳細](./physics.md) - 実装されている物理計算の詳細

## プロジェクト概要

Hawking Radiation Simulator Proは、ブラックホールのホーキング放射を可視化するWebベースのシミュレーターです。

### 主な機能

- **ブラックホールの物理量計算**: シュヴァルツシルト半径、ホーキング温度、放射パワー
- **パーティクルシミュレーション**: GPUベースの粒子システム
- **重力レンズ効果**: スクリーンスペースでの重力レンズ近似
- **フォトンショット**: 光が重力で曲がる様子の可視化
- **断面モード**: 重力の井戸の可視化

### 技術スタック

- **フロントエンド**: Three.js, WebGL
- **バックエンド**: FastAPI (Python)
- **物理計算**: JavaScript (フロントエンド) + Python (API)

## ファイル構成

```
hawking-sim-pro/
├── docs/              # ドキュメント
│   ├── README.md      # このファイル
│   └── physics.md     # 物理計算の詳細
├── api/               # Python API
│   └── server.py      # FastAPIサーバー
├── assets/             # アセット
│   └── shaders/       # GLSLシェーダー
├── main.js            # メインアプリケーション
├── constants.js       # 物理定数と計算関数
├── index.html         # HTML
└── style.css          # スタイル
```

## 開発者向け情報

### 物理計算の追加

新しい物理計算を追加する場合は、以下の手順に従ってください：

1. `constants.js` または `api/server.py` に計算関数を追加
2. `docs/physics.md` に計算式と実装詳細を追記
3. 必要に応じてUIとフロントエンドの統合

### APIの使用

Python APIを使用する場合：

```bash
npm run api
# または
uvicorn api.server:app --host 0.0.0.0 --port 8001 --reload
```

APIドキュメント: http://localhost:8001/docs

## ライセンス

MIT License

