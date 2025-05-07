// 导入替换脚本
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前脚本目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DENO_JS_PATH = path.join(__dirname, '../serverless/deno.js');
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');

// 从package.json获取版本号和依赖版本
function getPackageInfo() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const version = packageJson.version || '0.0.0';
  const dependencies = packageJson.dependencies || {};
  
  // 清理版本号，去掉 ^ 或 ~ 前缀
  const cleanVersion = (ver) => ver.replace(/[\^~]/g, '');
  
  return {
    version,
    dependencies: {
      hono: cleanVersion(dependencies.hono || ''),
      openai: cleanVersion(dependencies.openai || '')
    }
  };
}

const pkgInfo = getPackageInfo();
console.log('Package.json 信息:', pkgInfo);

// 创建替换规则
const replacements = [
  // 第三方依赖包
  { from: 'from "hono";', to: `from "npm:hono@${pkgInfo.dependencies.hono}";` },
  { from: 'from "hono/', to: `from "npm:hono@${pkgInfo.dependencies.hono}/` },
  { from: 'from "openai";', to: `from "npm:openai@${pkgInfo.dependencies.openai}";` },
  
  // Node.js 内置模块 - 添加node:前缀
  { from: 'from "fs";', to: 'from "node:fs";' },
  { from: 'from "path";', to: 'from "node:path";' },
  { from: 'from "url";', to: 'from "node:url";' },
  { from: 'from "child_process";', to: 'from "node:child_process";' },
  { from: 'from "crypto";', to: 'from "node:crypto";' },
  { from: 'from "util";', to: 'from "node:util";' },
  { from: 'from "stream";', to: 'from "node:stream";' },
  { from: 'from "events";', to: 'from "node:events";' },
  { from: 'from "buffer";', to: 'from "node:buffer";' },
  { from: 'from "http";', to: 'from "node:http";' },
  { from: 'from "https";', to: 'from "node:https";' }
];

console.log('正在修改 deno.js 中的导入语句...');

try {
  // 读取文件
  let content = fs.readFileSync(DENO_JS_PATH, 'utf8');
  
  // 执行所有替换
  replacements.forEach(({ from, to }) => {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    content = content.replace(regex, to);
  });
  
  // 添加版本号注释到文件开头
  const versionComment = `/**
 * Gemini Party v${pkgInfo.version}
 * 构建时间: ${new Date().toISOString()}
 * https://github.com/${process.env.GITHUB_REPOSITORY || 'your-username/gemini-party'}
 */

`;

  if (content.startsWith('/**\n * Gemini Party v')) {
    // 替换现有的版本注释块
    content = content.replace(/\/\*\*[\s\S]*?\*\/\s*/, versionComment);
  } else {
    content = versionComment + content;
  }
  
  // 更新版本号 - 处理多种可能的格式
  const versionPatterns = [
    // 标准版本占位符
    /(?:var|const|let)\s+version\s*=\s*(['"])0\.0\.0\1;\s*\/\/\s*BUILD_VERSION_PLACEHOLDER/g,
    // 编译后的版本变量
    /(?:var|const|let)\s+version\s*=\s*(['"])0\.0\.0\1;/g,
    // 任何版本的版本变量
    /(?:var|const|let)\s+version\s*=\s*(['"])[0-9]+\.[0-9]+\.[0-9]+\1;/g
  ];
  
  let replaced = false;
  for (const pattern of versionPatterns) {
    if (content.match(pattern)) {
      console.log(`找到版本号模式: ${pattern}`);
      content = content.replace(
        pattern,
        `var version = '${pkgInfo.version}'; // 自动构建于 ${new Date().toISOString()}`
      );
      replaced = true;
      break;
    }
  }
  
  if (!replaced) {
    console.warn('警告: 未找到标准版本号格式。尝试替换配置对象中的版本...');
    
    // 尝试查找配置对象并替换version
    const configPattern = /\bconfig\s*=\s*\{\s*[\r\n\s]*version\s*,/;
    if (content.match(configPattern)) {
      const versionDefinePattern = /(var|const|let)\s+version\s*=\s*(['"])[^'"]*\2;/;
      content = content.replace(versionDefinePattern, 
        `$1 version = '${pkgInfo.version}'; // 自动构建于 ${new Date().toISOString()}`);
      console.log('已替换config对象中引用的version变量');
      replaced = true;
    }
  }
  
  if (!replaced) {
    console.warn('⚠️ 未能替换任何版本号信息');
  }
  
  // 写回文件
  fs.writeFileSync(DENO_JS_PATH, content, 'utf8');
  
  console.log('导入语句修改完成！');
  console.log(`✅ Deno 构建文件已添加版本 v${pkgInfo.version} 信息`);
} catch (error) {
  console.error('修改导入语句时出错:', error);
  process.exit(1);
}