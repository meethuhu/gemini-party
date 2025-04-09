#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = packageJson.version;
const args = process.argv.slice(2);
const versionArg = args[0] || 'patch';

// 检查是否有未暂存的文件
const checkUnstagedChanges = () => {
  try {
    const status = execSync('git status --porcelain').toString();
    return status.trim() !== '';
  } catch (error) {
    console.warn('无法检查git状态，继续执行...');
    return false;
  }
};

// 检查package.json版本是否已被手动修改但未提交
const checkVersionModified = () => {
  try {
    // 获取git中记录的最新版本号
    const gitVersion = execSync('git show HEAD:package.json', { encoding: 'utf8' });
    try {
      const gitPackageJson = JSON.parse(gitVersion);
      const gitPackageVersion = gitPackageJson.version;
      
      // 比较git中的版本和当前文件中的版本
      if (gitPackageVersion !== currentVersion) {
        return {
          modified: true,
          gitVersion: gitPackageVersion,
          currentVersion
        };
      }
    } catch (parseError) {
      console.warn('无法解析git中的package.json:', parseError);
    }
  } catch (gitError) {
    console.warn('无法获取git中的package.json版本:', gitError);
  }
  
  return { modified: false };
};

// 获取用户输入的Promise函数
const getUserInput = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// 确保serverless目录存在
const serverlessDir = path.join(__dirname, '..', 'serverless');
if (!fs.existsSync(serverlessDir)) {
  fs.mkdirSync(serverlessDir, { recursive: true });
  console.log('创建 serverless 目录');
}

// 主程序
const main = async () => {
  // 标记是否版本号已被处理(手动修改并提交)
  let versionAlreadyHandled = false;
  
  // 检查版本号是否被手动修改
  const versionStatus = checkVersionModified();
  if (versionStatus.modified) {
    console.log('\n');
    console.log('⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️');
    console.log('⚠️                                              ⚠️');
    console.log(`⚠️  检测到package.json版本号已被手动修改:      ⚠️`);
    console.log(`⚠️  Git版本: ${versionStatus.gitVersion}  →  当前版本: ${versionStatus.currentVersion}  ⚠️`);
    console.log('⚠️                                              ⚠️');
    console.log('⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️');
    
    const answer = await getUserInput('\n是否使用这个手动修改的版本号? (y/n): ');
    if (answer.toLowerCase() === 'y') {
      try {
        versionAlreadyHandled = true; // 标记版本已处理
        execSync('git add package.json', { stdio: 'inherit' });
        execSync(`git commit -m "chore: 手动更新版本号至 v${currentVersion}"`, { stdio: 'inherit' });
        console.log(`✅ 已提交手动修改的版本号 v${currentVersion}`);
      } catch (error) {
        console.error('提交版本号修改失败:', error);
        process.exit(1);
      }
    } else if (answer.toLowerCase() !== 'n') {
      console.log('❌ 发布取消');
      process.exit(0);
    }
  }

  // 检查未暂存的文件
  if (checkUnstagedChanges()) {
    console.log('\n');
    console.log('🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨');
    console.log('🚨                                              🚨');
    console.log('🚨    警告: 您有未暂存或未提交的文件更改！    🚨');
    console.log('🚨                                              🚨');
    console.log('🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨 🚨');
    console.log('\n请检查以下变更:');
    
    execSync('git status', { stdio: 'inherit' });
    
    const answer = await getUserInput('\n是否要先暂存这些更改? (y/n): ');
    if (answer.toLowerCase() === 'y') {
      try {
        execSync('git add .', { stdio: 'inherit' });
        console.log('✅ 已暂存所有更改');
      } catch (error) {
        console.error('暂存更改失败:', error);
        process.exit(1);
      }
    } else if (answer.toLowerCase() !== 'n') {
      console.log('❌ 发布取消');
      process.exit(0);
    }
  }

  // 只有未手动处理版本的情况下才自动递增版本
  let newVersion = currentVersion;
  if (!versionAlreadyHandled) {
    // 更新版本
    console.log(`当前版本: ${currentVersion}`);
    execSync(`npm version ${versionArg} --no-git-tag-version`, { stdio: 'inherit' });

    // 读取新版本
    const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    newVersion = updatedPackageJson.version;
    console.log(`新版本: ${newVersion}`);
  } else {
    console.log(`使用手动设置的版本: v${currentVersion}`);
    newVersion = currentVersion; // 使用手动修改的版本
  }

  // 构建Deno版本文件
  console.log('\n构建 Deno 版本文件...');
  try {
    execSync('bun run deno-build', { stdio: 'inherit' });
    console.log('✅ Deno 构建完成');
  } catch (error) {
    console.error('❌ Deno 构建失败:', error);
    process.exit(1);
  }

  // 提交更改并创建标签
  console.log('\n提交更改...');
  
  // 如果版本号已手动处理，则不需要再次添加package.json
  if (!versionAlreadyHandled) {
    execSync('git add package.json', { stdio: 'inherit' });
  }
  
  // 添加构建的deno.js文件
  try {
    console.log('添加 deno.js 到暂存区...');
    if (fs.existsSync(path.join(serverlessDir, 'deno.js'))) {
      try {
        execSync('git add serverless/deno.js', { stdio: 'inherit' });
        console.log('✅ deno.js 已添加到暂存区');
      } catch (error) {
        console.warn('⚠️ 无法直接添加deno.js文件，尝试强制添加...');
        execSync('git add -f serverless/deno.js', { stdio: 'inherit' });
        console.log('✅ deno.js 已强制添加到暂存区');
      }
    } else {
      console.warn('⚠️ deno.js 文件不存在，无法添加');
    }
  } catch (error) {
    console.error('❌ 添加 deno.js 失败:', error.message);
    const answer = await getUserInput('\n无法添加 deno.js，是否继续提交? (y/n): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ 发布取消');
      process.exit(0);
    }
  }
  
  // 检查git状态，确认文件已添加
  console.log('\n当前暂存状态:');
  execSync('git status --short', { stdio: 'inherit' });
  
  // 只有在有文件需要提交时才创建提交
  const hasChangesToCommit = execSync('git status --porcelain --untracked-files=no').toString().trim() !== '';
  if (hasChangesToCommit || !versionAlreadyHandled) {
    // 如果是手动设置的版本且已经提交过，就不需要再次提交package.json
    if (!versionAlreadyHandled) {
      execSync(`git commit -m "chore: 发布 v${newVersion}"`, { stdio: 'inherit' });
    } else if (hasChangesToCommit) {
      // 如果有其他更改（比如deno.js），则创建新的提交
      execSync(`git commit -m "chore: 构建 v${newVersion} 的部署文件"`, { stdio: 'inherit' });
    }
  }
  
  // 检查是否已存在相同版本的标签
  const tagExists = execSync(`git tag -l v${newVersion}`).toString().trim() === `v${newVersion}`;
  if (!tagExists) {
    execSync(`git tag -a v${newVersion} -m "v${newVersion}"`, { stdio: 'inherit' });
    console.log(`✅ 已创建标签 v${newVersion}`);
  } else {
    console.log(`⚠️ 标签 v${newVersion} 已存在，跳过标签创建`);
  }

  console.log(`
✅ 版本已设置为 v${newVersion}
✅ deno.js 已构建并提交

执行以下命令推送更改并触发构建:
  git push && git push --tags
或者使用:
  bun run push
`);
};

// 执行主程序
main().catch(error => {
  console.error('发布过程发生错误:', error);
  process.exit(1);
});
