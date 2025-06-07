// functions/index.js (Final Version for @google-cloud/aiplatform v4.x.x)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { ImageAnnotatorClient } = require("@google-cloud/vision");

// ❗️ 改變 1: 從 v4 SDK 引入 "VertexAI" 這個主類別
const aiplatform = require('@google-cloud/aiplatform');
// 然後從中解構出我們需要的 VertexAI 類別和 helper
const { VertexAI } = aiplatform.v1;

// 全域設定
setGlobalOptions({ 
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 180,
    cors: true
});

// 初始化
admin.initializeApp();

// --- Vertex AI 設定 ---
const PROJECT_ID = 'devjam-be-462203';
const LOCATION = 'us-central1';
const ENDPOINT_ID = '3343291603648249856';
const DEPLOYED_INDEX_ID = 'deployed_clothing_index';

// --- 主函式 ---
exports.getSmartRecommendation = onCall(async (request) => {
    
    const filePath = request.data.filePath;
    if (!filePath) {
        throw new HttpsError('invalid-argument', 'The function must be called with "filePath".');
    }

    // 延遲初始化客戶端
    const visionClient = new ImageAnnotatorClient();
    const db = admin.firestore();
    
    try {
        // 步驟 1: Vision AI 分析 (不變)
        const bucketName = admin.storage().bucket().name;
        const fullGcsPath = `gs://${bucketName}/${filePath}`;
        console.log(`Analyzing image with Vision AI: ${fullGcsPath}`);
        
        const [visionResult] = await visionClient.labelDetection(fullGcsPath);
        const labels = visionResult.labelAnnotations.map(label => label.description);
        if (labels.length === 0) {
            throw new HttpsError('not-found', 'Could not identify features in the image.');
        }
        const queryText = labels.join(' ');
        console.log(`Querying Vertex AI with text: "${queryText}"`);

        // --- ❗️❗️ 關鍵修正點：使用 v4 的方式呼叫 Vertex AI ---

        // 步驟 2: 初始化 VertexAI 主客戶端
        const vertex_ai = new VertexAI({project: PROJECT_ID, location: LOCATION});

        // 步驟 3: 獲取指向你的索引端點的引用
        const matchingEngineEndpoint = vertex_ai.getMatchingEngineEndpoint(ENDPOINT_ID);

        // 步驟 4: 準備查詢請求
        const query = {
            id: `query-${Date.now()}`,
            // 向量維度必須與建立索引時設定的 768 維一致
            embedding: new Array(700).fill(0.1), // 使用一個非零的假向量
            neighborCount: 3,
            restricts: [{
                namespace: 'categories', // 假設建立索引時，我們用 'categories' 作為篩選的命名空間
                allow: labels // 允許結果必須包含這些 Vision AI 標籤
            }]
        };
        // 為了讓它也能利用文字內容，我們可以在 Restrict 中加入我們的標籤
        query.restricts = [{
            namespace: 'categories',
            allow: labels
        }];

        // 步驟 5: 執行查詢
        console.log(`Finding neighbors for deployed index: ${DEPLOYED_INDEX_ID}`);
        const [response] = await matchingEngineEndpoint.findNeighbors({
            deployedIndexId: DEPLOYED_INDEX_ID,
            queries: [query],
        });

        const neighbors = response[0]?.nearestNeighbors;
        if (!neighbors || neighbors.length === 0) {
            throw new HttpsError('not-found', 'Vertex AI returned no recommendations.');
        }
        console.log('Vertex AI found neighbors:', neighbors);
        
        // 步驟 6: Firestore 查詢 (不變)
        const neighborIds = neighbors.map(n => n.id);
        console.log(`Fetching details from Firestore for IDs: ${neighborIds.join(', ')}`);
        const promises = neighborIds.map(id => db.collection('clothes').doc(id).get());
        const docSnapshots = await Promise.all(promises);
        const recommendations = docSnapshots.filter(doc => doc.exists).map(doc => doc.data());
        
        return { success: true, recommendations };

    } catch (error) {
        console.error("FATAL Error:", error);
        throw new HttpsError('internal', error.message, error);
    }
});

exports.getOutfitRecommendation = onCall(async (request) => {
    
    const filePath = request.data.filePath;
    if (!filePath) {
        throw new HttpsError('invalid-argument', 'The function must be called with "filePath".');
    }

    // 延遲初始化客戶端
    const visionClient = new ImageAnnotatorClient();
    const db = admin.firestore();
    const bucketName = admin.storage().bucket().name;
    const fullGcsPath = `gs://${bucketName}/${filePath}`;

    try {
        // 步驟 1: Vision AI 分析
        console.log(`Analyzing image: ${fullGcsPath}`);
        const [result] = await visionClient.labelDetection(fullGcsPath);
        const labels = result.labelAnnotations.map(label => label.description.toLowerCase());
        console.log("Vision AI Labels detected:", labels);

        // 步驟 2: 簡單的硬編碼推薦邏輯
        const clothesRef = db.collection('clothes');
        let query;

        if (labels.includes("jeans") || labels.includes("trousers") || labels.includes("skirt") || labels.includes("pants") || labels.includes("shorts") || labels.includes("leggings") || labels.includes("capris") || labels.includes("sweatpants") || labels.includes("joggers")) {
            console.log("Detected bottom-wear, querying for a 'top'.");
            query = clothesRef.where('type', '==', 'top').limit(1);
        } else if (labels.includes("shirt") || labels.includes("t-shirt") || labels.includes("blouse") || labels.includes("top") || labels.includes("sweater") || labels.includes("hoodie") || labels.includes("tank top") || labels.includes("polo shirt") || labels.includes("camisole") || labels.includes("tunic") || labels.includes("vest")) {
            console.log("Detected top-wear, querying for a 'bottom'.");
            query = clothesRef.where('type', '==', 'bottom').limit(1);
        } else {
            // 如果辨識不出上下身，就推薦一件外套作為安全選擇
            console.log("Could not determine type, recommending an 'outer'.");
            query = clothesRef.where('type', '==', 'outer').limit(1);
        }

        // 步驟 3: 查詢 Firestore
        const snapshot = await query.get();

        if (snapshot.empty) {
            // 如果連安全選擇都找不到，就拋出錯誤
            throw new HttpsError('not-found', 'Could not find a suitable item to recommend in the database.');
        }

        const recommendationData = snapshot.docs[0].data();
        console.log("Returning recommendation:", recommendationData);
        
        return { success: true, recommendation: recommendationData };

    } catch (error) {
        console.error("FATAL Error:", error);
        throw new HttpsError('internal', error.message, error);
    }
});

exports.getFireStoreOutfitRecommendation = onCall(async (request) => {
    
    const filePath = request.data.filePath;
    if (!filePath) {
        throw new HttpsError('invalid-argument', 'The function must be called with "filePath".');
    }

    const visionClient = new ImageAnnotatorClient();
    const db = admin.firestore();
    const bucketName = admin.storage().bucket().name;
    const fullGcsPath = `gs://${bucketName}/${filePath}`;

    try {
        console.log(`Analyzing image: ${fullGcsPath}`);
        const [result] = await visionClient.labelDetection(fullGcsPath);
        const labels = result.labelAnnotations.map(label => label.description.toLowerCase());
        console.log("Vision AI Labels detected:", labels);

        const clothesRef = db.collection('clothes');
        let query;

        if (labels.includes("jeans") || labels.includes("trousers") || labels.includes("skirt") || labels.includes("pants")) {
            query = clothesRef.where('type', '==', 'top').limit(1);
        } else {
            query = clothesRef.where('type', '==', 'bottom').limit(1);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            throw new HttpsError('not-found', 'Could not find a suitable recommendation.');
        }

        const recommendationData = snapshot.docs[0].data();
        console.log("Returning recommendation:", recommendationData);
        
        return { success: true, recommendation: recommendationData };

    } catch (error) {
        console.error("FATAL Error:", error);
        throw new HttpsError('internal', error.message, error);
    }
});

exports.getVisionLabels = onCall({
    // 使用與其他函式相同的設定，確保環境一致
    memory: "512MiB", 
    timeoutSeconds: 120,
    cors: true
}, async (request) => {
    
    console.log("getVisionLabels function invoked.");

    // 1. 驗證輸入
    const filePath = request.data.filePath;
    if (!filePath) {
        throw new HttpsError('invalid-argument', 'The function must be called with "filePath".');
    }

    // 2. 初始化需要的客戶端
    const visionClient = new ImageAnnotatorClient();
    const bucketName = admin.storage().bucket().name;
    const fullGcsPath = `gs://${bucketName}/${filePath}`;

    try {
        // 3. 呼叫 Vision AI
        console.log(`Analyzing image with Vision AI: ${fullGcsPath}`);
        const [result] = await visionClient.labelDetection(fullGcsPath);
        const labels = result.labelAnnotations.map(label => ({
            description: label.description,
            score: label.score
        }));
        
        if (labels.length === 0) {
            throw new HttpsError('not-found', 'Vision AI could not identify any labels in the image.');
        }

        console.log("Successfully retrieved labels, returning to client:", labels);

        // 4. 直接將 Vision AI 的結果回傳給前端
        return { 
            success: true, 
            labels: labels // 回傳一個包含標籤和分數的物件陣列
        };

    } catch (error) {
        console.error("FATAL Error in getVisionLabels:", error);
        throw new HttpsError('internal', error.message, error);
    }
});