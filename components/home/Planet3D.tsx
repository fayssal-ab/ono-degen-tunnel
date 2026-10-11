"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, Float, MeshDistortMaterial } from "@react-three/drei";
import type { Mesh } from "three";

// A real 3D planet: a slowly rotating, gently distorted sphere with a ring and
// a starfield, lit in ONO's cyan/violet. No texture assets needed. This module
// is only ever loaded via next/dynamic (ssr:false), so three.js stays out of
// the initial bundle and never runs on the server.
function Planet() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12;
  });
  return (
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.6}>
      <mesh ref={ref}>
        <sphereGeometry args={[1.4, 64, 64]} />
        <MeshDistortMaterial color="#22d3ee" emissive="#0b2f5c" emissiveIntensity={0.45} roughness={0.35} metalness={0.15} distort={0.28} speed={1.1} />
      </mesh>
      <mesh rotation={[Math.PI / 2.1, 0.2, 0]}>
        <torusGeometry args={[2.15, 0.028, 16, 140]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2.1, 0.2, 0]}>
        <torusGeometry args={[2.45, 0.015, 16, 140]} />
        <meshBasicMaterial color="#f5c451" transparent opacity={0.4} />
      </mesh>
    </Float>
  );
}

export default function Planet3D() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5.2], fov: 45 }} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={2.2} color="#ffffff" />
      <pointLight position={[-5, -3, 2]} intensity={1.1} color="#8b5cf6" />
      <Stars radius={60} depth={30} count={1100} factor={3} saturation={0} fade speed={0.5} />
      <Planet />
    </Canvas>
  );
}
