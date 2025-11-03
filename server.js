import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// 静的ファイルの配信
app.use(express.static(__dirname));

// シェーダーファイルを正しいMIMEタイプで配信
app.get('/assets/shaders/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = join(__dirname, 'assets', 'shaders', filename);
  
  try {
    const content = readFileSync(filePath, 'utf8');
    
    // GLSLファイルのMIMEタイプを設定
    if (filename.endsWith('.glsl') || filename.endsWith('.vert.glsl') || filename.endsWith('.frag.glsl')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    
    res.send(content);
  } catch (error) {
    console.error(`Error reading shader file ${filename}:`, error);
    res.status(404).send('Shader file not found');
  }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// メインのHTMLファイル
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Hawking Radiation Simulator Pro`);
  console.log(`📡 Server running at http://localhost:${PORT}`);
  console.log(`🎨 Open http://localhost:${PORT} in your browser`);
});

