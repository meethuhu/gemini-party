// Node.js 环境下的图像生成示例
// 使用fetch调用本地API服务器并保存图像

const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_URL = 'http://localhost:3000/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent';
const API_KEY = 'YOUR_API_KEY'; // 替换为你的API密钥

async function generateAndSaveImage(prompt, outputFilename = 'generated-image.png') {
  console.log(`开始生成图像，提示词: "${prompt}"`);
  
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
        console.log(`图像已保存为: ${outputFilename}`);
        
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

// 命令行参数处理
const prompt = process.argv[2] || '一只可爱的熊猫在竹林中吃竹子';
const outputFile = process.argv[3] || 'generated-image.png';

// 执行图像生成
generateAndSaveImage(prompt, outputFile)
  .then(() => console.log('图像生成完成！'))
  .catch(err => console.error('错误:', err.message)); 