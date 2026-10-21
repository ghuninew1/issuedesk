import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function useGsapScroll(containerRef) {
    useEffect(() => {
        const container = containerRef.current;

        if (!container || typeof window === "undefined") return;

        const prefersReducedMotion =
            typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion) return;

        const ctx = gsap.context(() => {
            gsap.utils.toArray(".section").forEach((element) => {
                gsap.fromTo(
                    element,
                    {
                        autoAlpha: 0,
                        y: 28,
                    },
                    {
                        autoAlpha: 1,
                        y: 0,
                        duration: 0.7,
                        ease: "power2.out",
                        scrollTrigger: {
                            trigger: element,
                            start: "top 88%",
                            toggleActions: "play none none reverse",
                        },
                    },
                );
            });
        }, container);
        
        console.log("log GsapScroll", ctx.revert());
        return () => {
            ctx.revert();
        };
    }, [containerRef]);
}
