// 图像生成示例
// 使用fetch调用本地API服务器

const API_URL = 'http://localhost:3000/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent';
const API_KEY = 'YOUR_API_KEY'; // 替换为你的API密钥

async function generateImage(prompt) {
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

  const result = await response.json();
  
  // 处理返回结果
  console.log('生成结果:');
  
  for (const candidate of result.candidates || []) {
    for (const part of candidate.content.parts || []) {
      if (part.text) {
        console.log('文本回复:', part.text);
      } else if (part.inlineData) {
        // 图像数据是Base64编码的
        console.log('收到图像数据，Base64长度:', part.inlineData.data.length);
        
        // 如果在Node.js环境中，可以这样保存图像:
        /*
        const fs = require('fs');
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync('generated-image.png', buffer);
        console.log('图像已保存为 generated-image.png');
        */
      }
    }
  }
}

// 使用示例
generateImage('画一只可爱的熊猫在竹林中吃竹子').catch(console.error); 