/**
 * Import necessary modules from Firebase Functions V2 SDK.
 * V2 provides a cleaner, more modular way to define functions.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

/**
 * Import Firebase Admin SDK to interact with Firebase services like Auth, Firestore, and Storage.
 * Import Google Cloud Vision SDK to use the Image Annotation API.
 */
const admin = require("firebase-admin");
const { ImageAnnotatorClient } = require("@google-cloud/vision");

/**
 * Global Configuration for Cloud Functions.
 * By setting the region here, all functions defined in this file will automatically
 * be deployed to the specified region, preventing location mismatches.
 * This is the standard way to set regions in Functions V2.
 */
setGlobalOptions({ region: "us-central1" });

/**
 * Initialize the Firebase Admin SDK.
 * This only needs to be done once per application instance.
 */
admin.initializeApp();


//================================================================================
// 1. Dummy onCall Function for Debugging
//================================================================================
/**
 * A simple onCall function to test if the V2 invocation mechanism is working correctly.
 * It receives data from the client and sends it back, confirming a successful round trip.
 * In V2, the request object contains metadata and the actual data sent from the client.
 * The data is accessed via `request.data`.
 */
exports.dummyOnCall = onCall((request) => {
    console.log("dummyOnCall (v2) was invoked!");
    console.log("Data received from frontend:", request.data);

    // Return a success message along with the data that was received.
    return {
        message: "Successfully received your data!",
        dataYouSent: request.data
    };
});


//================================================================================
// 2. Core AI-Powered Outfit Recommendation Function
//================================================================================
/**
 * The main function for the "衣循環AI" project. It takes a file path of an uploaded
 * image, analyzes it using Google Cloud Vision AI, and returns a clothing recommendation.
 */
exports.getOutfitRecommendation = onCall(async (request) => {
    
    // In V2, the payload from the client is located in `request.data`.
    const filePath = request.data.filePath;

    // Validate that the required `filePath` argument was provided.
    if (!filePath) {
        console.error("Function called without 'filePath' argument.");
        throw new HttpsError('invalid-argument', 'The function must be called with the "filePath" argument.');
    }

    // Best Practice: Lazy initialize clients inside the function call.
    // This avoids initializing clients for function invocations that don't need them,
    // saving memory and startup time.
    const visionClient = new ImageAnnotatorClient();
    const bucketName = admin.storage().bucket().name; // Get the default storage bucket name.
    const fullGcsPath = `gs://${bucketName}/${filePath}`;

    try {
        // Log the image being analyzed for debugging purposes.
        console.log(`Analyzing image at: ${fullGcsPath}`);

        // Call the Cloud Vision API to detect labels in the image.
        const [result] = await visionClient.labelDetection(fullGcsPath);
        
        // Extract the descriptions from the labels and convert to lowercase for easier matching.
        const labels = result.labelAnnotations.map(label => label.description.toLowerCase());
        console.log("AI Labels detected:", labels);

        // --- HACKATHON CORE LOGIC ---
        // This is a simplified recommendation engine. In a real product, this would be
        // much more sophisticated, likely involving a query to a Firestore collection.
        let recommendationId = "default-item"; // A fallback recommendation.
        
        if (labels.includes("jeans") || labels.includes("denim") || labels.includes("trousers")) {
            // If the item is pants, recommend a shirt.
            recommendationId = "some-shirt-id"; 
        } else if (labels.includes("shirt") || labels.includes("t-shirt") || labels.includes("blouse")) {
            // If the item is a shirt, recommend pants.
            recommendationId = "some-pants-id";
        }
        
        // For the hackathon, we return a hardcoded "dummy" recommendation.
        // The "Data Analyst" on the team would populate a Firestore collection with
        // real items, and here we would query that collection based on the logic above.
        const recommendation = {
            id: recommendationId,
            name: "Classic White T-Shirt",
            imageUrl: "https://firebasestorage.googleapis.com/v0/b/devjam-be-462203.appspot.com/o/recommend-item%2FwT.jpg?alt=media&token=c413b5ef-1349-43c3-9d22-1d5952e89648"
        };

        // Log the successful recommendation and return it to the client.
        console.log("Returning recommendation:", recommendation);
        return { success: true, recommendation: recommendation };

    } catch (error) {
        // If anything goes wrong (e.g., Vision API error, file not found),
        // log the detailed error for debugging and throw a generic internal error
        // to the client to avoid exposing implementation details.
        console.error("FATAL: Error in getOutfitRecommendation:", error);
        throw new HttpsError('internal', 'An internal error occurred while processing the image.', error.message);
    }
});