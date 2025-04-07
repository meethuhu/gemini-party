
酒馆问题没有解决
systemInstruction parts 应该是一个数组
```
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Hi"
        }
      ]
    }
  ],
  "generationConfig": {
    "candidateCount": 1,
    "maxOutputTokens": 4000,
    "temperature": 1.27,
    "topP": 1
  },
  "systemInstruction": {
    "parts": {
      "text": ""
    }
  }
}
```