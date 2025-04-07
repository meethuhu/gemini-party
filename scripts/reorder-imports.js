import fs from 'fs';

const filePath = './dist/bundle.js';
const content = fs.readFileSync(filePath, 'utf8');

// 获取所有导入语句
const importRegex = /^import .+? from ".+?";$/gm;
const imports = content.match(importRegex) || [];

// 从内容中移除这些导入
const contentWithoutImports = content.replace(importRegex, '');

// 移除可能出现的多余空行
const cleanedContent = contentWithoutImports.replace(/\n{3,}/g, '\n\n');

// 将所有导入放在文件顶部
const orderedContent = imports.join('\n') + '\n\n' + cleanedContent;

fs.writeFileSync(filePath, orderedContent);
console.log('✅ 已将所有导入重排至文件顶部');