"""Generate OceanLinux Reseller API PDF for partners."""
from fpdf import FPDF
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "OCEANLINUX_RESELLER_API.pdf"


class ApiDocPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "OceanLinux Reseller API v1.0", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}  |  support@oceanlinux.com", align="C")

    def title_page(self):
        self.add_page()
        self.set_font("Helvetica", "B", 26)
        self.set_text_color(0, 80, 160)
        self.cell(0, 20, "OceanLinux", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "B", 20)
        self.set_text_color(30, 30, 30)
        self.cell(0, 12, "Reseller API Documentation", new_x="LMARGIN", new_y="NEXT", align="C")
        self.ln(8)
        self.set_font("Helvetica", "", 12)
        self.set_text_color(60, 60, 60)
        self.multi_cell(0, 7, "Partner Integration Guide\nVersion 1.0  |  June 2025", align="C")
        self.ln(15)
        self.set_font("Helvetica", "", 11)
        self.multi_cell(
            0,
            6,
            "Integrate VPS hosting into your website or billing panel.\n"
            "Buy servers, manage power, sync credentials, and renew — all via REST API.",
            align="C",
        )

    def h1(self, text):
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(0, 80, 160)
        self.multi_cell(0, 8, text)
        self.ln(2)

    def h2(self, text):
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 7, text)
        self.ln(1)

    def body(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text)

    def code_block(self, text):
        self.set_font("Courier", "", 9)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(20, 20, 20)
        for line in text.strip().split("\n"):
            self.cell(0, 5, "  " + line, new_x="LMARGIN", new_y="NEXT", fill=True)
        self.ln(3)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.multi_cell(0, 5.5, "  - " + text)


def build():
    pdf = ApiDocPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.title_page()

    pdf.add_page()
    pdf.h1("1. Base URL & Authentication")
    pdf.body("Base URL:")
    pdf.code_block("https://oceanlinux.com/api/v1/reseller")
    pdf.body("Required headers on EVERY request:")
    pdf.code_block("x-api-key:    rz_YOUR_API_KEY\nx-api-secret: sec_YOUR_API_SECRET")
    pdf.ln(2)
    pdf.body(
        "IMPORTANT: Never expose API Secret in frontend JavaScript.\n"
        "Always call the API from your backend server only."
    )

    pdf.h1("2. Quick Start Flow")
    for step in [
        "GET  /products              - Show stock + your prices",
        "POST /orders                - Buy server (wallet deduct + auto provision)",
        "GET  /orders/{orderId}      - Get IP + password (poll every 15 sec)",
        "GET  /orders/{orderId}/status - Online / offline status",
        "POST /orders/manage         - Start / stop / restart / reinstall",
        "POST /orders/{orderId}/sync - Sync IP, password, validity",
        "POST /orders/{orderId}/renew - Renew service",
    ]:
        pdf.bullet(step)

    pdf.h1("3. Account & Wallet")
    pdf.h2("GET /account")
    pdf.body("Returns business info, wallet balance, and overview stats.")
    pdf.code_block(
        '{\n'
        '  "overview": {\n'
        '    "totalRecharged": 10000,\n'
        '    "totalSpent": 599,\n'
        '    "totalOrders": 1,\n'
        '    "currentBalance": 9401\n'
        '  }\n'
        '}'
    )
    pdf.h2("GET /wallet")
    pdf.body("Balance + transaction history (recharges and purchases with rates).")

    pdf.h1("4. Products")
    pdf.h2("GET /products")
    pdf.body("List all products with YOUR custom prices.")
    pdf.code_block(
        '"memoryOptions": {\n'
        '  "4GB": { "price": 599, "basePrice": 699 }\n'
        '}'
    )
    pdf.body("price = your rate | basePrice = reference only")
    pdf.h2("GET /products?id=PRODUCT_ID")
    pdf.body("Single product details.")

    pdf.add_page()
    pdf.h1("5. Buy Server")
    pdf.h2("POST /orders")
    pdf.code_block(
        '{\n'
        '  "productId": "65a1b2c3...",\n'
        '  "memoryOption": "4GB",\n'
        '  "userEmail": "customer@yourdomain.com",\n'
        '  "os": "Ubuntu 22"\n'
        '}'
    )
    pdf.body("OS options: Ubuntu 22 | CentOS 7 | Windows 2022 64")
    pdf.body("Response includes order id and walletBalance. Poll GET /orders/{id} until IP + password appear (2-5 min).")

    pdf.h1("6. Orders")
    pdf.h2("GET /orders")
    pdf.body("List all your orders with price, IP, credentials, expiry.")
    pdf.h2("GET /orders/{orderId}")
    pdf.body("Single order + management.osTemplates (live OS list, same as OceanLinux reinstall dropdown).")

    pdf.h1("7. Server Status (Online / Offline)")
    pdf.h2("GET /orders/{orderId}/status")
    pdf.code_block(
        '{\n'
        '  "online": true,\n'
        '  "powerState": "running"\n'
        '}'
    )
    pdf.body("running = ON | stopped = OFF. Same as OceanLinux panel.")

    pdf.h1("8. Sync (IP, Password, Validity)")
    pdf.h2("POST /orders/{orderId}/sync")
    pdf.body("Pull latest data from OceanLinux. Use after reinstall or any credential change.")
    pdf.code_block(
        '{\n'
        '  "ipAddress": "103.179.xx.xx",\n'
        '  "username": "root",\n'
        '  "password": "NewPass123",\n'
        '  "validity": {\n'
        '    "expiryDate": "2025-08-20T00:00:00.000Z",\n'
        '    "daysRemaining": 28,\n'
        '    "status": "active"\n'
        '  }\n'
        '}'
    )

    pdf.add_page()
    pdf.h1("9. Manage Server")
    pdf.h2("POST /orders/manage")
    pdf.code_block('{ "orderId": "65b...", "action": "start" }')
    pdf.body("Actions:")
    for a in [
        "start   - Power ON",
        "stop    - Power OFF",
        "restart - Reboot server",
        "status  - Get power state",
        "sync    - Sync credentials",
        "templates - Live OS list (Windows 2022/2025, Ubuntu — same as Ocean panel)",
        "reinstall - Rebuild OS (osType = template id or name from osTemplates)",
        "changeos  - Change OS (SmartVPS products)",
    ]:
        pdf.bullet(a)
    pdf.ln(2)
    pdf.body("List OS templates:")
    pdf.code_block('{ "orderId": "65b...", "action": "templates" }')
    pdf.body("Reinstall example:")
    pdf.code_block('{ "orderId": "65b...", "action": "reinstall", "osType": "Windows Server 2025" }')
    pdf.body("After reinstall: wait 3-5 min, then POST /orders/{id}/sync for new password.")

    pdf.h1("10. Renew")
    pdf.h2("GET /orders/{orderId}/renew")
    pdf.body("Check renewal price and eligibility.")
    pdf.h2("POST /orders/{orderId}/renew")
    pdf.body("Deducts wallet, extends expiry, renews upstream provider. Opens within 2 days of expiry.")

    pdf.h1("11. Error Codes")
    for row in [
        "200 - Success",
        "201 - Order created",
        "401 - Invalid API key/secret",
        "402 - Insufficient wallet balance",
        "403 - Account suspended",
        "404 - Not found",
        "409 - Out of stock",
    ]:
        pdf.bullet(row)

    pdf.add_page()
    pdf.h1("12. cURL Examples")
    pdf.h2("Buy server")
    pdf.code_block(
        'curl -X POST "https://oceanlinux.com/api/v1/reseller/orders" \\\n'
        '  -H "x-api-key: rz_YOUR_KEY" \\\n'
        '  -H "x-api-secret: sec_YOUR_SECRET" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"productId":"ID","memoryOption":"4GB","userEmail":"client@mail.com"}\''
    )
    pdf.h2("Check status")
    pdf.code_block(
        'curl "https://oceanlinux.com/api/v1/reseller/orders/ORDER_ID/status" \\\n'
        '  -H "x-api-key: rz_YOUR_KEY" \\\n'
        '  -H "x-api-secret: sec_YOUR_SECRET"'
    )
    pdf.h2("Sync credentials")
    pdf.code_block(
        'curl -X POST "https://oceanlinux.com/api/v1/reseller/orders/ORDER_ID/sync" \\\n'
        '  -H "x-api-key: rz_YOUR_KEY" \\\n'
        '  -H "x-api-secret: sec_YOUR_SECRET"'
    )
    pdf.h2("Stop server")
    pdf.code_block(
        'curl -X POST "https://oceanlinux.com/api/v1/reseller/orders/manage" \\\n'
        '  -H "x-api-key: rz_YOUR_KEY" \\\n'
        '  -H "x-api-secret: sec_YOUR_SECRET" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"orderId":"ORDER_ID","action":"stop"}\''
    )

    pdf.ln(6)
    pdf.h1("Support")
    pdf.body("Wallet recharge / API secret reset / technical help:")
    pdf.body("Email: support@oceanlinux.com")
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, "(c) OceanLinux - Reseller Partner API v1.0", align="C")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    print(f"PDF created: {OUT}")


if __name__ == "__main__":
    build()
