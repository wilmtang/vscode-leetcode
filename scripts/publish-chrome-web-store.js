const fs = require("fs");

const config = {
    clientId: getRequiredEnv("CHROME_WEBSTORE_CLIENT_ID"),
    clientSecret: getRequiredEnv("CHROME_WEBSTORE_CLIENT_SECRET"),
    refreshToken: getRequiredEnv("CHROME_WEBSTORE_REFRESH_TOKEN"),
    publisherId: getRequiredEnv("CHROME_WEBSTORE_PUBLISHER_ID"),
    extensionId: getRequiredEnv("CHROME_WEBSTORE_EXTENSION_ID"),
    zipPath: getRequiredEnv("CHROME_WEBSTORE_ZIP"),
};

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});

async function main() {
    const accessToken = await getAccessToken();

    const uploadResult = await uploadPackage(accessToken);
    console.log(`Chrome Web Store upload state: ${uploadResult.uploadState || "unknown"}`);

    if (uploadResult.itemError && uploadResult.itemError.length) {
        console.error(JSON.stringify(uploadResult.itemError, null, 2));
        process.exit(1);
    }

    console.log("Waiting 10 seconds for the Web Store to process the uploaded package before publishing...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const publishResult = await publishItem(accessToken);
    console.log(`Chrome Web Store publish response: ${JSON.stringify(publishResult)}`);
}

async function getAccessToken() {
    const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        throw new Error(`Failed to refresh Chrome Web Store access token: ${JSON.stringify(data)}`);
    }

    return data.access_token;
}

async function uploadPackage(accessToken) {
    const zip = fs.readFileSync(config.zipPath);
    const response = await fetch(
        `https://chromewebstore.googleapis.com/upload/v2/publishers/${config.publisherId}/items/${config.extensionId}:upload`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/zip",
            },
            body: zip,
        }
    );

    return parseApiResponse(response, "upload Chrome Web Store package");
}

async function publishItem(accessToken) {
    const response = await fetch(
        `https://chromewebstore.googleapis.com/v2/publishers/${config.publisherId}/items/${config.extensionId}:publish`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    return parseApiResponse(response, "publish Chrome Web Store item");
}

async function parseApiResponse(response, action) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        throw new Error(`Failed to ${action}: ${JSON.stringify(data)}`);
    }

    return data;
}

function getRequiredEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}
