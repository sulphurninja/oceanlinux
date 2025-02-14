import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";

export default function PrivacyPolicy() {
    return (
        <>
            <Header />
            <div className="p-6 max-w-4xl mx-auto leading-relaxed text-muted -800">
                <h1 className="text-4xl font-bold mb-4 text-start text-accent ">Privacy Policy</h1>
                <p>Welcome to Ocean Linux. Your privacy is critically important to us.</p>
                <h2 className="text-2xl font-semibold mt-6">1. Information We Collect</h2>
                <p>We collect personal details such as your name, email, payment information, and server usage logs to provide and improve our services.</p>
                <h2 className="text-2xl font-semibold mt-6">2. How We Use Your Information</h2>
                <p>Your information is used to create accounts, process payments, enhance security, and improve customer experience. We do not sell or share your data, except for legal compliance or payment processing.</p>
                <h2 className="text-2xl font-semibold mt-6">3. Security Measures</h2>
                <p>We utilize advanced encryption and cybersecurity measures to protect your data. However, no online system is entirely risk-free.</p>
                <h2 className="text-2xl font-semibold mt-6">4. Third-Party Services</h2>
                <p>We integrate with third-party providers like Cashfree Payments Gateway for payment processing. Their privacy policies apply to their respective services.</p>
                <p>The registered banking entity handling transactions for our Cashfree payments is <b>Sachin Pawar</b>.</p>
                <p className="mt-4">For privacy concerns, contact us at <b>spenterprises8441@gmail.com</b>.</p>
            </div>
            <Footer />
        </>
    );
}

