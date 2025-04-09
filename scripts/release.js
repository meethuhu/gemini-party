#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = packageJson.version;
const args = process.argv.slice(2);
const versionArg = args[0] || 'patch';

// 更新版本
console.log(`当前版本: ${currentVersion}`);
execSync(`npm version ${versionArg} --no-git-tag-version`, { stdio: 'inherit' });

// 读取新版本
const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const newVersion = updatedPackageJson.version;
console.log(`新版本: ${newVersion}`);

// 提交更改并创建标签
execSync('git add package.json', { stdio: 'inherit' });
execSync(`git commit -m "chore: 发布 v${newVersion}"`, { stdio: 'inherit' });
execSync(`git tag -a v${newVersion} -m "v${newVersion}"`, { stdio: 'inherit' });

console.log(`
✅ 版本已更新为 v${newVersion}

执行以下命令推送更改并触发构建:
  git push && git push --tags
`);
