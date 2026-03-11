import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 1 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  // Glow pulse
  const glowIntensity = interpolate(
    frame,
    [30, 60, 90, 120],
    [0.2, 0.5, 0.3, 0.5],
    { extrapolateRight: 'clamp' }
  );

  // Tagline typing effect: "Monitor. Control. Optimize."
  const tagline = 'Monitor. Control. Optimize.';
  const typeStart = 40;
  const charsVisible = Math.floor(
    interpolate(frame, [typeStart, typeStart + 60], [0, tagline.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const typedText = tagline.slice(0, charsVisible);

  // Cursor blink
  const cursorVisible = frame > typeStart && (frame < typeStart + 65 || Math.floor(frame / 8) % 2 === 0);

  // Subtitle
  const subtitleSpring = spring({
    frame: frame - 90,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.8 },
  });
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [20, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background gradient orb */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.emeraldGlow}, transparent 70%)`,
          opacity: glowIntensity,
          filter: 'blur(80px)',
        }}
      />

      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          zIndex: 1,
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 40px ${COLORS.emeraldGlow}`,
          }}
        >
          <span
            style={{
              fontSize: 50,
              fontWeight: 900,
              color: COLORS.white,
              fontFamily: FONTS.sans,
            }}
          >
            C
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: FONTS.sans,
            fontSize: 96,
            fontWeight: 800,
            color: COLORS.white,
            margin: 0,
            letterSpacing: -3,
          }}
        >
          Cla
          <span style={{ color: COLORS.emerald }}>Watch</span>
        </h1>

        {/* Tagline */}
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 36,
            color: COLORS.emerald,
            height: 44,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {typedText}
          <span
            style={{
              display: 'inline-block',
              width: 3,
              height: 36,
              backgroundColor: COLORS.emerald,
              marginLeft: 2,
              opacity: cursorVisible ? 1 : 0,
            }}
          />
        </div>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: FONTS.sans,
            fontSize: 30,
            color: COLORS.gray400,
            margin: 0,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Your AI Agent Command Center
        </p>
      </div>
    </AbsoluteFill>
  );
};
