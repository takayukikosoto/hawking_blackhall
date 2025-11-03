FROM python:3.11-slim

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションファイルをコピー
COPY . .

# ポートを公開
EXPOSE 8080

# アプリケーションを起動
CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8080"]

