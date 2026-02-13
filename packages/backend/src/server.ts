import { buildApp } from './app.js';
import { env } from './config/env.js';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

start();
