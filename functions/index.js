/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const { ImageAnnotatorClient } = require("@google-cloud/vision");

// 初始化 Vision AI 客戶端
const visionClient = new ImageAnnotatorClient();

exports.getOutfitRecommendation = functions.https.onCall(async (data, context) => {
    // data.filePath 將會是前端上傳到 Storage 後的圖片路徑
    const filePath = data.filePath;
    const STORAGE_BUCKET = functions.config().storage.bucket; // 確保你已經在 Firebase 環境變數中設定了 storage.bucket
    // 1. 使用 Vision AI 分析圖片
    // TODO: 撰寫呼叫 Vision AI 的程式碼
    const [result] = await visionClient.labelDetection(`gs://${STORAGE_BUCKET}/${filePath}`);
    const labels = result.labelAnnotations.map(label => label.description);

    console.log("AI Labels:", labels); // 在後台日誌中查看AI辨識結果

    // 2. 根據分析結果，設計你的推薦邏輯
    // TODO: 根據 labels 去 Firestore 查詢商品
    let recommendation = { name: "推薦的褲子", imageUrl: "..." }; // 暫時的假資料

    // 3. 回傳推薦結果給前端
    return { recommendation: recommendation };
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
