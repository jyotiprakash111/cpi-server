import dotenv from 'dotenv';
import { buildApp } from './app.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n======================================================`);
    console.log(`🚀 CPI Commissioning Backend running on http://${HOST}:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/health`);
    console.log(`📊 API Info:     http://localhost:${PORT}/`);
    console.log(`======================================================\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startServer();
