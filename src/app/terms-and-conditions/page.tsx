import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";

export default function TermsConditions() {
    return (
        <>
            <Header />
            <div className="p-6 max-w-4xl mx-auto text-muted leading-relaxed -800">
                <h1 className="text-4xl font-bold mb-4 text-start text-accent">Terms & Conditions</h1>
                <p>By using Ocean Linux, you agree to the following terms:</p>
                <h2 className="text-2xl font-semibold mt-6">1. Account Registration</h2>
                <p>Users must provide accurate information during registration. Accounts involved in fraudulent activity will be terminated without prior notice.</p>
                <h2 className="text-2xl font-semibold mt-6">2. Service Usage</h2>
                <p>Our services cannot be used for illegal activities, including but not limited to hacking, phishing, and spamming. Violations result in immediate suspension.</p>
                <h2 className="text-2xl font-semibold mt-6">3. Payments & Billing</h2>
                <p>All payments must be completed in advance. Failure to pay may result in suspension or termination.</p>
                <h2 className="text-2xl font-semibold mt-6">4. Termination Policy</h2>
                <p>We reserve the right to terminate accounts violating our policies without prior notice.</p>
            </div>
            <Footer />
        </>
    );
}
