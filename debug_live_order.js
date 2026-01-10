
const API_URL = "http://localhost:3000/api/v1/reseller";
const API_KEY = "rz_323e4712d0657ae76210bc20b26f76da";
const API_SECRET = "sec_46e0b712a8c81ba29a601103bfb7228720c6d7f2ad3c362d8aa72b1b6690b195";

async function testLiveApi() {
    console.log("1. Fetching Products...");
    try {
        const prodRes = await fetch(`${API_URL}/products`, {
            headers: {
                'x-api-key': API_KEY,
                'x-api-secret': API_SECRET
            }
        });

        if (!prodRes.ok) {
            console.error(`Fetch Products Failed: ${prodRes.status} ${prodRes.statusText}`);
            console.error(await prodRes.text());
            return;
        }

        const prodData = await prodRes.json();
        console.log(`Success. Found ${prodData.products.length} products.`);

        if (prodData.products.length === 0) {
            console.error("No products to buy.");
            return;
        }

        const product = prodData.products[0];
        // Get first memory option
        const memoryOption = Object.keys(product.memoryOptions)[0];
        const price = product.memoryOptions[memoryOption].price;

        console.log(`2. Attempting to buy: ${product.name} (${memoryOption}) for ${price}`);

        const orderRes = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-api-secret': API_SECRET
            },
            body: JSON.stringify({
                productId: product._id,
                memoryOption: memoryOption,
                userEmail: "debug_test@oceanlinux.com"
            })
        });

        if (!orderRes.ok) {
            console.error(`Order Failed: ${orderRes.status} ${orderRes.statusText}`);
            console.error(await orderRes.text());
        } else {
            const orderData = await orderRes.json();
            console.log("Order Success!", orderData);
        }

    } catch (err) {
        console.error("Script Error:", err);
    }
}

testLiveApi();
