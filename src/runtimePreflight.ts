export interface RuntimePreflightOptions {
  allowNonProd?: boolean;
  allowMemoryInProduction?: boolean;
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function shouldRunRuntimePreflight(env: NodeJS.ProcessEnv): boolean {
  return env.ENABLE_RUNTIME_PREFLIGHT === '1' || env.NODE_ENV === 'production';
}

export function validateRuntimeEnv(
  env: NodeJS.ProcessEnv,
  options: RuntimePreflightOptions = {}
): string[] {
  const errors: string[] = [];
  const allowNonProd = options.allowNonProd ?? false;
  const allowMemoryInProduction = options.allowMemoryInProduction ?? false;

  const nodeEnv = env.NODE_ENV?.trim();
  if (isBlank(nodeEnv)) {
    errors.push('NODE_ENV 未设置');
  } else if (nodeEnv !== 'production' && !allowNonProd) {
    errors.push(`NODE_ENV=${nodeEnv}，不是 production（可设置 ALLOW_NON_PROD=1 跳过）`);
  }

  const storageDriver = env.STORAGE_DRIVER?.trim();
  if (isBlank(storageDriver)) {
    errors.push('STORAGE_DRIVER 未设置，应为 postgres 或 memory');
  } else if (storageDriver !== 'postgres' && storageDriver !== 'memory') {
    errors.push(`STORAGE_DRIVER=${storageDriver} 非法，应为 postgres 或 memory`);
  }

  if (storageDriver === 'memory' && nodeEnv === 'production' && !allowMemoryInProduction) {
    errors.push('生产环境不建议使用 memory 存储（可设置 ALLOW_MEMORY_IN_PRODUCTION=1 跳过）');
  }

  if (storageDriver === 'postgres') {
    const databaseUrl = env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      errors.push('STORAGE_DRIVER=postgres 时 DATABASE_URL 必填');
    } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
      errors.push('DATABASE_URL 格式非法，应以 postgres:// 或 postgresql:// 开头');
    }
  }

  const port = (env.PORT ?? '3000').trim();
  if (!/^\d+$/.test(port)) {
    errors.push(`PORT=${port} 非法，必须是数字`);
  } else {
    const value = Number(port);
    if (value < 1 || value > 65535) {
      errors.push(`PORT=${port} 超出范围，应在 1-65535`);
    }
  }

  return errors;
}

export function assertRuntimeEnv(
  env: NodeJS.ProcessEnv,
  options: RuntimePreflightOptions = {}
): void {
  const errors = validateRuntimeEnv(env, options);
  if (errors.length === 0) {
    return;
  }

  const message = ['启动前环境变量校验失败：', ...errors.map((item) => `- ${item}`)].join('\n');
  throw new Error(message);
}
