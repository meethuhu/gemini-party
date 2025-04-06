// Node.js 环境下的图像编辑示例
// 上传一张图片，并让模型基于这张图片进行编辑

const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_URL = 'http://localhost:3000/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent';
const API_KEY = 'YOUR_API_KEY'; // 替换为你的API密钥

async function editImage(imagePath, prompt, outputFilename = 'edited-image.png') {
  console.log(`开始编辑图像，提示词: "${prompt}"`);
  
  // 读取并编码图片
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt
            },
            {
              inlineData: {
                mimeType: getImageMimeType(imagePath),
                data: base64Image
              }
            }
          ]
        }
      ],
      responseModalities: ["Text", "Image"]
    })
  });

  if (!response.ok) {
    throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  
  // 处理返回结果
  console.log('处理生成结果:');
  
  for (const candidate of result.candidates || []) {
    for (const part of candidate.content.parts || []) {
      if (part.text) {
        console.log('模型文本回复:', part.text);
      } else if (part.inlineData && part.inlineData.data) {
        // 保存图像
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, 'base64');
        
        fs.writeFileSync(outputFilename, buffer);
        console.log(`编辑后的图像已保存为: ${outputFilename}`);
        
        return {
          success: true,
          imagePath: outputFilename,
          textResponse: result.text
        };
      }
    }
  }
  
  throw new Error('API返回中没有包含图像数据');
}

// 根据文件扩展名获取MIME类型
function getImageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  
  return mimeTypes[ext] || 'image/jpeg';
}

// 命令行参数处理
const imagePath = process.argv[2]; // 输入图片路径
const prompt = process.argv[3] || '在这张图片旁边添加一只可爱的羊驼';
const outputFile = process.argv[4] || 'edited-image.png';

if (!imagePath) {
  console.error('错误: 请提供输入图片路径');
  console.log('用法: node edit-image-node.js <图片路径> [提示词] [输出文件名]');
  process.exit(1);
}

// 执行图像编辑
editImage(imagePath, prompt, outputFile)
  .then(() => console.log('图像编辑完成！'))
  .catch(err => console.error('错误:', err.message)); 