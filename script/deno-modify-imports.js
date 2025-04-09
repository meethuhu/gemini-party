// 导入替换脚本
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前脚本目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DENO_JS_PATH = path.join(__dirname, '../dist/deno.js');
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');

// 从 package.json 获取依赖版本
function getDependencyVersions() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const dependencies = packageJson.dependencies || {};
  
  // 清理版本号，去掉 ^ 或 ~ 前缀
  const cleanVersion = (version) => version.replace(/[\^~]/g, '');
  
  return {
    hono: cleanVersion(dependencies.hono || ''),
    genai: cleanVersion(dependencies['@google/genai'] || ''),
    openai: cleanVersion(dependencies.openai || '')
  };
}

// 获取版本号
const versions = getDependencyVersions();
console.log('从 package.json 中获取的版本号:', versions);

// 创建替换规则
const replacements = [
  { from: 'from "hono";', to: `from "npm:hono@${versions.hono}";` },
  { from: 'from "hono/', to: `from "npm:hono@${versions.hono}/` },
  { from: 'from "@google/genai";', to: `from "npm:@google/genai@${versions.genai}";` },
  { from: 'from "openai";', to: `from "npm:openai@${versions.openai}";` }
];

console.log('正在修改 deno.js 中的导入语句...');

try {
  // 读取文件
  let content = fs.readFileSync(DENO_JS_PATH, 'utf8');
  
  // 执行所有替换
  replacements.forEach(({ from, to }) => {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    content = content.replace(regex, to);
    console.log(`替换 ${from} -> ${to}`);
  });
  
  // 写回文件
  fs.writeFileSync(DENO_JS_PATH, content, 'utf8');
  
  console.log('导入语句修改完成！');
} catch (error) {
  console.error('修改导入语句时出错:', error);
  process.exit(1);
} 