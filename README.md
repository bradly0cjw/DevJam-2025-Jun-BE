# DevJam-2025-Jun

### **【衣循環AI】後端 API 規格 v1.0**
這份文件說明了如何使用 Firebase Functions 來呼叫「衣循環AI」的服裝推薦 API。這個 API 會根據使用者上傳的圖片，從 Firestore 資料庫中隨機選擇一件適合的服裝推薦。

#### **函式名稱 (Function Name)**
`getOutfitRecommendation`

#### **呼叫方式**
使用 Firebase Functions `https.onCall` v9 語法進行呼叫。

```javascript
// 前端呼叫範例
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(app, 'us-central1'); // 確保區域是 us-central1
const getOutfit = httpsCallable(functions, 'getOutfitRecommendation');

try {
    const result = await getOutfit({ filePath: "your-image-path.jpg" });
    const recommendation = result.data.recommendation;
    // ... 在這裡更新你的 UI ...
} catch (error) {
    // ... 在這裡處理錯誤 ...
}
```

#### **傳入參數 (Request Payload)**

你需要傳入一個 JavaScript 物件，裡面必須包含 `filePath` 這個 key。

*   **型別**: `Object`
*   **格式**:
    ```json
    {
      "filePath": "images/the-image-user-uploaded.jpg"
    }
    ```
*   **說明**: `filePath` 是使用者上傳圖片後，它在 Firebase Storage 中的**相對路徑**（包含資料夾名稱和檔案名）。

---

#### **回傳結果 (Response Payload)**

API 會回傳一個 JavaScript 物件，你可以從 `result.data` 中取得。

##### **成功時 (Success)**

如果一切順利，`result.data` 的格式如下：

*   **型別**: `Object`
*   **格式**:
    ```json
    {
      "success": true,
      "recommendation": {
        "name": "復古高腰牛仔褲",
        "type": "bottom",
        "color": "blue",
        "imageUrl": "https://firebasestorage.googleapis.com/v0/b/...",
        "description": "一條百搭的牛仔褲，適合各種場合。"
      }
    }
    ```
*   **欄位說明**:
    *   `success`: 一定是 `true`。
    *   `recommendation`: 一個物件，代表 AI 推薦的商品。
        *   `name` (String): 商品名稱。
        *   `type` (String): 商品類型 (例如: "top", "bottom")。
        *   `color` (String): 主要顏色。
        *   `imageUrl` (String): **可以直接在 `<img>` 標籤中使用的公開圖片網址**。
        *   `description` (String, 可選): 商品的簡單描述。

##### **失敗時 (Error)**

如果發生錯誤，前端的 `try...catch` 區塊會捕捉到一個 `error` 物件。你可以從 `error.message` 中取得給使用者看的錯誤訊息。

*   **常見錯誤訊息**:
    *   `The function must be called with the "filePath" argument.` (前端忘記傳 `filePath`)
    *   `No recommendation items found in the database.` (資料庫是空的)
    *   `An internal error occurred while processing the image.` (其他所有後端內部錯誤)

---

**給「資料分析師」的備註**：請確保你在 Firestore 的 `clothes` 集合中，至少新增一筆 `type` 為 `"top"` 和一筆 `type` 為 `"bottom"` 的文件，否則查詢會失敗！