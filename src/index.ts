import 'dotenv/config';
import { buildServer } from './server';
import { assertRuntimeEnv, shouldRunRuntimePreflight } from './runtimePreflight';

async function main() {
  if (shouldRunRuntimePreflight(process.env)) {
    assertRuntimeEnv(process.env, {
      allowNonProd: process.env.ALLOW_NON_PROD === '1',
      allowMemoryInProduction: process.env.ALLOW_MEMORY_IN_PRODUCTION === '1'
    });
  }

  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
