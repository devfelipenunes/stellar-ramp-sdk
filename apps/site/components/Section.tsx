"use client";
import { motion } from "framer-motion";

export function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`mx-auto max-w-6xl px-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}
