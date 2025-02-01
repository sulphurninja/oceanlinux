import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import Security from "@/components/landing/Security";

export default function SecurityPage() {
    return (
        <div className="min-h-screen  text-white">
            <Header />
            <main className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="container mx-auto">
                    <h1 className="text-4xl font-bold mb-8 text-center">Enterprise-Grade Security</h1>
                    <p className="text-xl mb-12 text-center">
                        Protect your data and applications with our advanced security measures.
                    </p>
                    <Security />
                </div>
            </main>
            <Footer />
        </div>
    )
}

