import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function collect(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? collect(file) : file.endsWith('.js') ? [file] : [];
  });
}

const files = ['js', 'server', 'tests'].flatMap((directory) => collect(directory));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Sintaxe verificada: ${files.length} arquivos JavaScript.`);
