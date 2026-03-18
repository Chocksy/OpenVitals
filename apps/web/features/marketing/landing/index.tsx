import { Nav } from './sections/nav';
import { Hero } from './sections/hero';
import { HeroProduct } from './sections/hero-product';
import { TrustBar } from './sections/trust-bar';
import { FeatureAiParsing } from './sections/feature-ai-parsing';
import { FeatureProvenance } from './sections/feature-provenance';
import { FeatureAiChat } from './sections/feature-ai-chat';
import { FeatureSharing } from './sections/feature-sharing';
import { FeatureMedications } from './sections/feature-medications';
import { Testimonials } from './sections/testimonials';
import { Frontier } from './sections/frontier';
import { Changelog } from './sections/changelog';
import { Mission } from './sections/mission';
import { FinalCta } from './sections/final-cta';
import { Footer } from './sections/footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F7' }}>
      <Nav />
      <Hero />
      <HeroProduct />
      <TrustBar />
      <FeatureAiParsing />
      <FeatureProvenance />
      <FeatureAiChat />
      <FeatureSharing />
      <FeatureMedications />
      <Testimonials />
      <Frontier />
      <Changelog />
      <Mission />
      <FinalCta />
      <Footer />
    </div>
  );
}
