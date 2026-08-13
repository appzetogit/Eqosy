import React, { useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  className = "",
  delay = 0,
  from = "up",
}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const getTransform = () => {
    if (shown) return "translate-x-0 translate-y-0 scale-100 opacity-100";
    if (from === "up") return "translate-y-8 opacity-0";
    if (from === "down") return "-translate-y-8 opacity-0";
    if (from === "left") return "-translate-x-8 opacity-0";
    if (from === "right") return "translate-x-8 opacity-0";
    if (from === "scale") return "scale-95 opacity-0";
    return "translate-y-8 opacity-0";
  };

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${getTransform()} ${className}`}
    >
      {children}
    </div>
  );
}

export function TiltCard({
  children,
  className = "",
  intensity = 10,
}) {
  const ref = useRef(null);
  const [style, setStyle] = useState({});

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setStyle({
      transform: `perspective(1000px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) scale3d(1.02, 1.02, 1.02)`,
      transition: "transform 100ms ease-out",
    });
  };

  const onLeave = () => {
    setStyle({
      transform: "perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)",
      transition: "transform 400ms ease-out",
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={style}
      className={`tilt-glare will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}
