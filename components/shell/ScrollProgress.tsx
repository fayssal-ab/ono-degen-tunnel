"use client";

import { motion, useScroll, useSpring } from "motion/react";

// Thin scroll-progress bar across the top — a premium "you are here" cue.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[9996] h-0.5 origin-left"
      style={{ scaleX, background: "linear-gradient(90deg, var(--color-cyan), var(--color-plasma), var(--color-gold))" }}
    />
  );
}
