import questLogo from "@/assets/marketing/brand-logos/quest-diagnostics.svg";
import labcorpLogo from "@/assets/marketing/brand-logos/labcorp.svg";
import mayoLogo from "@/assets/marketing/brand-logos/mayo-clinic.svg";
import clevelandLogo from "@/assets/marketing/brand-logos/cleveland-clinic.svg";
import kaiserLogo from "@/assets/marketing/brand-logos/kaiser.svg";
import epicLogo from "@/assets/marketing/brand-logos/epic.svg";
import cernerLogo from "@/assets/marketing/brand-logos/cerner.svg";
import adobeLogo from "@/assets/marketing/brand-logos/adobe.svg";

const providers = [
  { name: "Quest Diagnostics", logo: questLogo },
  { name: "LabCorp", logo: labcorpLogo },
  { name: "Mayo Clinic", logo: mayoLogo },
  { name: "Cleveland Clinic", logo: clevelandLogo },
  { name: "Kaiser", logo: kaiserLogo },
  { name: "Epic", logo: epicLogo },
  { name: "Cerner", logo: cernerLogo },
  { name: "Adobe", logo: adobeLogo },
];

export function TrustBar() {
  return (
    <section className="pb-10 pt-0">
      <div className="mx-auto max-w-280 px-6 text-center">
        <h2
          className="mb-6 text-[14px] text-neutral-500"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Parses lab reports from the most common providers
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {providers.map(({ name, logo }) => (
            <div
              key={name}
              className="relative flex items-center justify-center"
            >
              <div className="flex h-16 w-full items-center justify-center rounded-lg border border-neutral-200/80 bg-neutral-100/80 px-4 sm:h-18 md:h-24">
                <div
                  className="h-6 w-full max-w-[70%] bg-neutral-700 sm:h-7 md:h-8"
                  style={{
                    maskImage: `url(${logo.src})`,
                    maskSize: "contain",
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskImage: `url(${logo.src})`,
                    WebkitMaskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                  }}
                  role="img"
                  aria-label={name}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
