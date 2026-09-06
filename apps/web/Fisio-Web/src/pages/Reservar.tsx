import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ReservaWizard } from "./ReservaWizard";

export default function ReservarPage() {
  return (
    <>
      <Navbar />
      <main className="relative flex-1 overflow-hidden bg-white py-14 sm:py-20">
        <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-64" />
        <div className="relative">
          <ReservaWizard />
        </div>
      </main>
      <Footer />  
    </>
  );
}
