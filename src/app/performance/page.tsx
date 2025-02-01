import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import Performance from "@/components/landing/Performance";


export default function PerformancePage() {
    return (
        <div className="min-h-screen  text-white">
            <Header />
            <main className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="container mx-auto">
                    <h1 className="text-4xl font-bold mb-8 text-center">Unmatched Performance</h1>
                    <p className="text-xl mb-12 text-center">
                        Experience lightning-fast speeds and unparalleled efficiency with Ocean Linux VPS hosting.
                    </p>
                    <Performance />
                </div>
            </main>
            <Footer />
        </div>
    )
}

