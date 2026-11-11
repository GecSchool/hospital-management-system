import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';

const app = express();
const port = 3000;

app.use(express.json());

// 문서 초안만 제공한다. 명세의 API가 구현되었다는 의미는 아니다.
const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
app.get('/api-docs/openapi.yaml', (_req, res) => {
  res.type('application/yaml').sendFile(openApiPath);
});
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(undefined, { swaggerOptions: { url: '/api-docs/openapi.yaml' } }),
);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`API 서버: http://localhost:${port}`);
});
