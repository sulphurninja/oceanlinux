import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";

export default function ContactUs() {
    return (
        <>
            <Header />
            <div className="p-6 max-w-6xl mx-auto text-muted leading-relaxed">
                <h1 className="text-4xl font-bold mb-6 text-start text-accent">Contact Us</h1>

                <p className="mb-6">Have questions, need support, or want to collaborate? Reach out to us through any of the following channels.</p>

                {/* Support Section */}
                <h2 className="text-2xl font-semibold mt-8">Customer Support</h2>
                <p>If you require assistance with our services, billing, or account-related inquiries, please contact our support team.</p>
                <p>Email: <b>spenterprises8441@gmail.com</b></p>
                <p>Phone: +91 97662 22327  (Mon-Fri, 10 AM - 6 PM IST)</p>

                {/* Business & Partnerships */}
                <h2 className="text-2xl font-semibold mt-8">Business & Partnerships</h2>
                <p>For business inquiries, collaborations, or partnership opportunities, please reach out to our business team.</p>
                <p>Email: <b>spenterprises8441@gmail.com</b></p>

                {/* Payment Information */}
                <h2 className="text-2xl font-semibold mt-8">Payment Information</h2>
                <p>All transactions for Ocean Linux services are securely processed via our payment gateway, <b>Cashfree</b>. Please note that the registered banking entity for payment processing is <b>Sachin Pawar</b>.</p>
               

                {/* Social Media */}
                <h2 className="text-2xl font-semibold mt-8">Connect with Us</h2>
                <p>Follow us on social media to stay updated on our latest features and announcements.</p>
                <p>Twitter: <b>@OceanLinux</b></p>
                <p>LinkedIn: <b>Ocean Linux</b></p>
            </div>
            <Footer />
        </>
    );
}
