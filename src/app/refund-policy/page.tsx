import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";

export default function RefundPolicy() {
    return (
        <>
            <Header />
            <div className="p-6 max-w-4xl mx-auto text-muted leading-relaxed -800">
                <h1 className="text-4xl font-bold mb-4 text-start text-accent">Refund & Cancellation Policy</h1>
                <p>Ocean Linux follows a strict <b>NO REFUND</b> policy.</p>
                <h2 className="text-2xl font-semibold mt-6">1. No Refunds</h2>
                <p>Once a payment is made, it is non-refundable under any circumstances, including change of mind, service misinterpretation, or accidental purchases.</p>
                <h2 className="text-2xl font-semibold mt-6">2. Cancellation Policy</h2>
                <p>Users can cancel their services at any time, but no refunds will be issued for unused periods.</p>
                <h2 className="text-2xl font-semibold mt-6">3. Chargeback Policy</h2>
                <p>Unauthorized chargebacks will lead to account suspension, and we reserve the right to take legal action in cases of fraudulent claims.</p>
            </div>
            <Footer />
        </>
    );
}
