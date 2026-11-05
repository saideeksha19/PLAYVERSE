import { startServer } from './server';

startServer()
  .then((running) => {
    console.log(`[playverse] server listening on http://localhost:${running.port}`);
    console.log(`[playverse] health check: http://localhost:${running.port}/api/health`);
    console.log(`[playverse] allowed origins: ${running.config.clientOrigins.join(', ')}`);

    const shutdown = (signal: string) => {
      console.log(`[playverse] ${signal} received, shutting down`);
      running
        .close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((error: unknown) => {
    console.error('[playverse] failed to start:', error);
    process.exit(1);
  });
